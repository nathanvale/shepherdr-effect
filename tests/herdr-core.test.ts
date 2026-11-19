import { expect, test } from "bun:test";
import { Effect, Fiber, Stream } from "effect";
import {
  HerdrCore,
  SendPermitMaker,
} from "../src/adapters/herdr-core/index.ts";
import { AttemptId } from "../src/domains/attempt/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";
import { anotherAttemptId, attemptId } from "./attempt-fixtures.ts";
import {
  entries,
  everyEntryRefusal,
  labelledFor,
  lookalikePermit,
  onTestLink,
  permitFor,
  started,
  t1,
  t9,
  workerStart,
} from "./herdr-core-fixtures.ts";

const unlabelledAttemptId = AttemptId.make("no terminal carries this");
const bytesOf = (text: string) => new TextEncoder().encode(text);

const permitRefused = {
  _tag: "SendPermitRefused",
  reason: "not made by the send permit maker, or already spent",
};

test("a send permit starts one terminal, labelled with its attempt id", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      const address = yield* started;
      const labelled = yield* link.listTerminals({ "herdr.launch": attemptId });
      const others = yield* link.listTerminals({ "herdr.launch": "another" });
      return { address, labelled, others };
    }),
  );

  expect(seen).toEqual({
    address: t1,
    labelled: [
      {
        ...workerStart,
        address: t1,
        labels: { "herdr.task": "shepherdr#4", "herdr.launch": attemptId },
      },
    ],
    others: [],
  });
});

test("a spent send permit, and a value that only looks like one, start nothing", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      const permit = yield* permitFor(attemptId);
      yield* link.startTerminal(permit, workerStart);
      const spent = yield* Effect.flip(link.startTerminal(permit, workerStart));
      const forged = yield* Effect.flip(
        link.startTerminal(lookalikePermit(attemptId), workerStart),
      );
      const terminals = yield* link.listTerminals();
      return {
        refusals: [spent, forged].map(failureOf),
        terminals: terminals.map(({ address }) => address),
      };
    }),
  );

  expect(seen).toEqual({
    refusals: [permitRefused, permitRefused],
    terminals: [t1],
  });
});

test("a link that sent nothing finds exactly one terminal labelled with the attempt id, and cannot rule a start out otherwise", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      return {
        one: yield* link.observeLaunch(attemptId),
        two: yield* link.observeLaunch(anotherAttemptId),
        none: yield* link.observeLaunch(unlabelledAttemptId),
      };
    }),
    {
      terminals: [
        labelledFor(attemptId, "t7"),
        labelledFor(anotherAttemptId, "t8"),
        labelledFor(anotherAttemptId, "t9"),
      ],
    },
  );

  expect(seen).toEqual({
    one: { _tag: "PositiveEvidence", attemptId, result: "t7" },
    two: { _tag: "Unobservable" },
    none: { _tag: "Unobservable" },
  });
});

for (const [startReply, terminals, observed] of [
  [
    "lost-after-start",
    [t1],
    { _tag: "PositiveEvidence", attemptId, result: "t1" },
  ],
  ["lost-before-start", [], { _tag: "Unobservable" }],
] as const)
  test(`a start whose reply is ${startReply} answers that its request was sent and not answered, and observeLaunch answers ${observed._tag}`, async () => {
    const seen = await onTestLink(
      Effect.gen(function* () {
        const link = yield* HerdrCore;
        const lost = yield* Effect.flip(started);
        const listed = yield* link.listTerminals();
        return {
          lost: failureOf(lost),
          observed: yield* link.observeLaunch(attemptId),
          terminals: listed.map(({ address }) => address),
        };
      }),
      { startReply },
    );

    expect(seen).toEqual({
      lost: {
        _tag: "HerdrCoreUnavailable",
        entry: "startTerminal",
        request: "unanswered",
      },
      observed,
      terminals: [...terminals],
    });
  });

test("what is typed into a terminal reaches its screen and whoever watches it", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      const address = yield* started;
      const watching = yield* link
        .watchTerminal(address)
        .pipe(
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        );
      yield* link.typeInto(address, {
        _tag: "Text",
        text: "herdr-task status",
      });
      yield* link.typeInto(address, { _tag: "Keys", keys: ["enter"] });
      yield* link.typeInto(address, { _tag: "Interrupt" });
      const watched = yield* Fiber.join(watching);
      const decoder = new TextDecoder();
      return {
        screen: yield* link.readScreen(address),
        watched: watched.map((bytes) => decoder.decode(bytes)),
        unknown: failureOf(yield* Effect.flip(link.readScreen(t9))),
      };
    }),
  );

  expect(seen).toEqual({
    screen: "herdr-task status<enter>^C",
    watched: ["herdr-task status", "<enter>", "^C"],
    unknown: { _tag: "TerminalNotFound", address: "t9" },
  });
});

test("labelling and killing a terminal change what is listed, and events tells each change", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      const telling = yield* link.events.pipe(
        Stream.take(3),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      );
      const address = yield* started;
      yield* link.labelTerminal(address, {
        "herdr.alert": "needs you",
        "herdr.task": null,
      });
      const labelled = yield* link.listTerminals();
      yield* link.killTerminal(address);
      const told = yield* Fiber.join(telling);
      return {
        labels: labelled.map(({ labels }) => labels),
        after: yield* link.listTerminals(),
        told: told.map((event) => event._tag),
        gone: failureOf(yield* Effect.flip(link.killTerminal(address))),
      };
    }),
  );

  expect(seen).toEqual({
    labels: [{ "herdr.launch": attemptId, "herdr.alert": "needs you" }],
    after: [],
    told: ["TerminalChanged", "TerminalChanged", "TerminalRemoved"],
    gone: { _tag: "TerminalNotFound", address: "t1" },
  });
});

test("a shared document is written only at the version that was read", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      const missing = yield* link.readSharedDocument("shepherdr.host");
      const written = yield* link.updateSharedDocument({
        ...missing,
        value: { machine: "mini" },
      });
      const stale = yield* Effect.flip(
        link.updateSharedDocument({ ...missing, value: { machine: "late" } }),
      );
      return {
        missing,
        written,
        stale: failureOf(stale),
        here: yield* link.readSharedDocument("shepherdr.host"),
        there: yield* link.readSharedDocument("shepherdr.host", "mini"),
        unlinked: failureOf(
          yield* Effect.flip(
            link.readSharedDocument("shepherdr.host", "pilot"),
          ),
        ),
      };
    }),
    { machines: ["mini"] },
  );

  const empty = { name: "shepherdr.host", value: null, version: 0 };
  const first = {
    name: "shepherdr.host",
    value: { machine: "mini" },
    version: 1,
  };
  expect(seen).toEqual({
    missing: empty,
    written: first,
    stale: {
      _tag: "SharedDocumentConflict",
      name: "shepherdr.host",
      version: 1,
    },
    here: first,
    there: empty,
    unlinked: { _tag: "MachineNotLinked", machine: "pilot" },
  });
});

test("a command on a linked machine answers as scripted and can read a file written there", async () => {
  const seen = await onTestLink(
    Effect.gen(function* () {
      const link = yield* HerdrCore;
      yield* link.writeFileOnMachine(
        "mini",
        "install/marker",
        bytesOf("digest-1"),
      );
      return {
        machines: yield* link.listMachines,
        cat: yield* link.execOnMachine({
          machine: "mini",
          argv: ["cat", "install/marker"],
        }),
        unlinked: failureOf(
          yield* Effect.flip(
            link.execOnMachine({ machine: "pilot", argv: ["uname"] }),
          ),
        ),
      };
    }),
    {
      machines: ["mini"],
      exec: ({ machine, argv }, files) => ({
        exitCode: 0,
        stdout: new TextDecoder().decode(files.get(`${machine}:${argv[1]}`)),
        stderr: "",
      }),
    },
  );

  expect(seen).toEqual({
    machines: ["local", "mini"],
    cat: { exitCode: 0, stdout: "digest-1", stderr: "" },
    unlinked: { _tag: "MachineNotLinked", machine: "pilot" },
  });
});

test("a command nobody scripted is not found", async () => {
  const reply = await onTestLink(
    Effect.flatMap(HerdrCore, (link) =>
      link.execOnMachine({ machine: "local", argv: ["uname", "-sm"] }),
    ),
  );

  expect(reply).toEqual({
    exitCode: 127,
    stdout: "",
    stderr: "uname: not scripted",
  });
});

test("with the link lost every entry answers link lost, naming itself and saying that its request was not sent", async () => {
  const lost = await onTestLink(everyEntryRefusal, { linkLost: true });

  expect(lost.map(failureOf)).toEqual(
    entries.map((entry) => ({
      _tag: "HerdrCoreUnavailable",
      entry,
      request: "not-sent",
    })),
  );
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    everyEntryRefusal.pipe(
      Effect.provide(HerdrCore.layer),
      Effect.provide(SendPermitMaker.layer),
    ),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual(
    entries.map((entry) => `NotBuilt: HerdrCore.${entry}`),
  );
});
