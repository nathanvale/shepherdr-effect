import { Effect, Fiber, PubSub, Ref, Stream } from "effect";
import {
  HerdrCoreUnavailable,
  type HerdrCoreShape,
  type MachineCommand,
  MachineNotLinked,
  type MachineReply,
  SendPermitRefused,
  SharedDocumentConflict,
  type SharedDocument,
  type Terminal,
  TerminalAddress,
  type TerminalEvent,
  TerminalNotFound,
  type Typed,
} from "./herdr-core-link.ts";
import { spendSendPermit } from "./send-permit.ts";

export interface HerdrCoreTestScript {
  readonly machines?: ReadonlyArray<string>;
  readonly terminals?: ReadonlyArray<Terminal>;
  readonly exec?: (
    command: MachineCommand,
    files: ReadonlyMap<string, Uint8Array>,
  ) => MachineReply;
  readonly startReply?:
    | "address"
    | "lost-after-start"
    | "lost-before-start"
    | { readonly withheldUntil: Effect.Effect<void> };
  readonly linkLost?: boolean;
}

interface Core {
  readonly terminals: ReadonlyMap<TerminalAddress, Terminal>;
  readonly screens: ReadonlyMap<TerminalAddress, string>;
  readonly documents: ReadonlyMap<string, SharedDocument>;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

interface Output {
  readonly address: TerminalAddress;
  readonly bytes: Uint8Array;
}

function typedText(typed: Typed): string {
  switch (typed._tag) {
    case "Text":
      return typed.text;
    case "Keys":
      return typed.keys.map((key) => `<${key}>`).join("");
    case "Interrupt":
      return "^C";
  }
}

function carries(
  terminal: Terminal,
  labels: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(labels).every(
    ([name, value]) => terminal.labels[name] === value,
  );
}

function relabelled(
  terminal: Terminal,
  labels: Readonly<Record<string, string | null>>,
): Terminal {
  const kept = Object.entries({ ...terminal.labels, ...labels }).flatMap(
    ([name, value]) => (value === null ? [] : [[name, value] as const]),
  );
  return { ...terminal, labels: Object.fromEntries(kept) };
}

export function herdrCoreTestLink(
  script: HerdrCoreTestScript,
): Effect.Effect<HerdrCoreShape> {
  return Effect.gen(function* () {
    const seeded = script.terminals ?? [];
    const core = yield* Ref.make<Core>({
      terminals: new Map(
        seeded.map((terminal) => [terminal.address, terminal]),
      ),
      screens: new Map(),
      documents: new Map(),
      files: new Map(),
    });
    const told = yield* PubSub.unbounded<TerminalEvent>();
    const output = yield* PubSub.unbounded<Output>();
    const machines = ["local", ...(script.machines ?? [])];

    const linked = (
      entry: string,
    ): Effect.Effect<Core, HerdrCoreUnavailable> =>
      script.linkLost === true
        ? Effect.fail(new HerdrCoreUnavailable({ entry, request: "not-sent" }))
        : Ref.get(core);
    const onMachine = (
      entry: string,
      machine = "local",
    ): Effect.Effect<Core, MachineNotLinked | HerdrCoreUnavailable> =>
      machines.includes(machine)
        ? linked(entry)
        : Effect.fail(new MachineNotLinked({ machine }));
    const terminalAt = (entry: string, address: TerminalAddress) =>
      linked(entry).pipe(
        Effect.flatMap(({ terminals }) => {
          const terminal = terminals.get(address);
          return terminal === undefined
            ? Effect.fail(new TerminalNotFound({ address }))
            : Effect.succeed(terminal);
        }),
      );
    const changed = (terminal: Terminal) =>
      Ref.update(core, (before) => ({
        ...before,
        terminals: new Map(before.terminals).set(terminal.address, terminal),
      })).pipe(
        Effect.andThen(
          PubSub.publish(told, { _tag: "TerminalChanged", terminal }),
        ),
      );
    const unanswered = Effect.fail(
      new HerdrCoreUnavailable({
        entry: "startTerminal",
        request: "unanswered",
      }),
    );

    return {
      startTerminal: (permit, start) =>
        Effect.gen(function* () {
          const attemptId = spendSendPermit(permit);
          if (attemptId === undefined)
            return yield* new SendPermitRefused({
              reason: "not made by the send permit maker, or already spent",
            });
          yield* linked("startTerminal");
          const reply = script.startReply ?? "address";
          if (reply === "lost-before-start") return yield* unanswered;
          const startedByHerdrCore = Ref.get(core).pipe(
            Effect.map(({ terminals }) =>
              TerminalAddress.make(`t${terminals.size + 1}`),
            ),
            Effect.tap((address) =>
              changed({
                ...start,
                address,
                labels: { ...start.labels, "herdr.launch": attemptId },
              }),
            ),
          );
          if (typeof reply === "object")
            return yield* reply.withheldUntil.pipe(
              Effect.andThen(startedByHerdrCore),
              Effect.forkDetach,
              Effect.flatMap(Fiber.join),
            );
          const address = yield* startedByHerdrCore;
          if (reply === "lost-after-start") return yield* unanswered;
          return address;
        }),
      listTerminals: (labels = {}) =>
        linked("listTerminals").pipe(
          Effect.map(({ terminals }) =>
            [...terminals.values()].filter((each) => carries(each, labels)),
          ),
        ),
      readScreen: (address) =>
        terminalAt("readScreen", address).pipe(
          Effect.andThen(Ref.get(core)),
          Effect.map(({ screens }) => screens.get(address) ?? ""),
        ),
      labelTerminal: (address, labels) =>
        terminalAt("labelTerminal", address).pipe(
          Effect.flatMap((terminal) => changed(relabelled(terminal, labels))),
        ),
      typeInto: (address, typed) =>
        terminalAt("typeInto", address).pipe(
          Effect.andThen(
            Ref.update(core, (before) => ({
              ...before,
              screens: new Map(before.screens).set(
                address,
                (before.screens.get(address) ?? "") + typedText(typed),
              ),
            })),
          ),
          Effect.andThen(
            PubSub.publish(output, {
              address,
              bytes: new TextEncoder().encode(typedText(typed)),
            }),
          ),
        ),
      killTerminal: (address) =>
        terminalAt("killTerminal", address).pipe(
          Effect.andThen(
            Ref.update(core, (before) => {
              const terminals = new Map(before.terminals);
              terminals.delete(address);
              return { ...before, terminals };
            }),
          ),
          Effect.andThen(
            PubSub.publish(told, { _tag: "TerminalRemoved", address }),
          ),
        ),
      watchTerminal: (address) =>
        Stream.unwrap(
          terminalAt("watchTerminal", address).pipe(
            Effect.as(
              Stream.fromPubSub(output).pipe(
                Stream.filter((each) => each.address === address),
                Stream.map((each) => each.bytes),
              ),
            ),
          ),
        ),
      events: Stream.unwrap(
        linked("events").pipe(Effect.as(Stream.fromPubSub(told))),
      ),
      readSharedDocument: (name, machine = "local") =>
        onMachine("readSharedDocument", machine).pipe(
          Effect.map(
            ({ documents }) =>
              documents.get(`${machine}\n${name}`) ?? {
                name,
                value: null,
                version: 0,
              },
          ),
        ),
      updateSharedDocument: (document, machine = "local") =>
        onMachine("updateSharedDocument", machine).pipe(
          Effect.andThen(
            Ref.modify(core, (before) => {
              const key = `${machine}\n${document.name}`;
              const version = before.documents.get(key)?.version ?? 0;
              if (version !== document.version)
                return [undefined, before] as const;
              const written = { ...document, version: version + 1 };
              return [
                written,
                {
                  ...before,
                  documents: new Map(before.documents).set(key, written),
                },
              ] as const;
            }),
          ),
          Effect.flatMap((written) =>
            written === undefined
              ? Effect.flatMap(Ref.get(core), ({ documents }) =>
                  Effect.fail(
                    new SharedDocumentConflict({
                      name: document.name,
                      version:
                        documents.get(`${machine}\n${document.name}`)
                          ?.version ?? 0,
                    }),
                  ),
                )
              : Effect.succeed(written),
          ),
        ),
      execOnMachine: (command) =>
        onMachine("execOnMachine", command.machine).pipe(
          Effect.map(
            ({ files }) =>
              script.exec?.(command, files) ?? {
                exitCode: 127,
                stdout: "",
                stderr: `${command.argv[0]}: not scripted`,
              },
          ),
        ),
      writeFileOnMachine: (machine, path, bytes) =>
        onMachine("writeFileOnMachine", machine).pipe(
          Effect.andThen(
            Ref.update(core, (before) => ({
              ...before,
              files: new Map(before.files).set(`${machine}:${path}`, bytes),
            })),
          ),
        ),
      listMachines: linked("listMachines").pipe(Effect.as(machines)),
      observeLaunch: (attemptId) =>
        linked("observeLaunch").pipe(
          Effect.map(({ terminals }) => {
            const labelled = [...terminals.values()].filter((each) =>
              carries(each, { "herdr.launch": attemptId }),
            );
            const [only, ...others] = labelled;
            return only === undefined || others.length > 0
              ? { _tag: "Unobservable" }
              : { _tag: "PositiveEvidence", attemptId, result: only.address };
          }),
        ),
    };
  });
}
