import { Context, Data, Effect, Layer, Ref, Result } from "effect";
import type {
  AttemptId,
  PositiveEvidence,
  RefutingEvidence,
} from "../../domains/attempt/index.ts";
import { HerdrCore } from "../herdr-core/index.ts";
import { type NotBuilt, notBuilt } from "../not-built.ts";

export interface MachineHealth {
  readonly load: number;
  readonly memoryAvailableMb: number;
  readonly diskAvailableMb: number;
}

export interface RemoteReply {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface RemoteCommand {
  readonly machine: string;
  readonly argv: readonly [string, ...string[]];
  readonly once?: AttemptId;
}

type JobObservation =
  | { readonly _tag: "NoEvidence" }
  | {
      readonly _tag: "JobFinished";
      readonly evidence: PositiveEvidence;
      readonly reply: RemoteReply;
    };

class MachineUnreachable extends Data.TaggedError("MachineUnreachable")<{
  readonly machine: string;
}> {}

class RemoteInstallFailed extends Data.TaggedError("RemoteInstallFailed")<{
  readonly machine: string;
  readonly step: string;
}> {}

class RemoteCommandRefused extends Data.TaggedError("RemoteCommandRefused")<{
  readonly attemptId: AttemptId;
}> {}

type Failing<E = never> = E | MachineUnreachable | NotBuilt;

interface RemoteMachinesShape {
  readonly ensureInstalled: (
    machine: string,
  ) => Effect.Effect<Installed, Failing<RemoteInstallFailed>>;
  readonly probeHealth: (
    machine: string,
  ) => Effect.Effect<MachineHealth, Failing>;
  readonly runCommand: (
    command: RemoteCommand,
  ) => Effect.Effect<RemoteReply, Failing<RemoteCommandRefused>>;
  readonly lookUpAttempt: (
    machine: string,
    attemptId: AttemptId,
  ) => Effect.Effect<PositiveEvidence | RefutingEvidence, Failing>;
  readonly observeJob: (
    machine: string,
    jobId: string,
    attemptId: AttemptId,
  ) => Effect.Effect<JobObservation, Failing>;
}

export interface MachineInMemory {
  readonly health: MachineHealth;
  readonly installedBundle?: string;
  readonly installFailsAt?: string;
  readonly reply?: (argv: ReadonlyArray<string>) => RemoteReply;
  readonly jobs?: Readonly<Record<string, RemoteReply>>;
}

export interface RemoteMachinesTestScript {
  readonly bundleDigest: string;
  readonly machines: Readonly<Record<string, MachineInMemory>>;
}

interface There {
  readonly installed: Readonly<Record<string, string>>;
  readonly applied: ReadonlyMap<AttemptId, string>;
  readonly refused: ReadonlySet<AttemptId>;
}

type Step<A, E = never> = (
  before: There,
) => readonly [Result.Result<A, E>, There];

interface Installed {
  readonly bundleDigest: string;
  readonly installed: "already" | "now";
}

function installing(
  machine: string,
  found: MachineInMemory,
  bundleDigest: string,
): Step<Installed, RemoteInstallFailed> {
  return (before) => {
    const has = before.installed[machine] ?? found.installedBundle;
    if (has === bundleDigest)
      return [Result.succeed({ bundleDigest, installed: "already" }), before];
    if (found.installFailsAt !== undefined)
      return [
        Result.fail(
          new RemoteInstallFailed({ machine, step: found.installFailsAt }),
        ),
        before,
      ];
    return [
      Result.succeed({ bundleDigest, installed: "now" }),
      {
        ...before,
        installed: { ...before.installed, [machine]: bundleDigest },
      },
    ];
  };
}

function running(
  found: MachineInMemory,
  { argv, once }: RemoteCommand,
): Step<RemoteReply, RemoteCommandRefused> {
  return (before) => {
    if (once === undefined)
      return [Result.succeed(replyTo(found, argv)), before];
    if (before.refused.has(once) || before.applied.has(once))
      return [
        Result.fail(new RemoteCommandRefused({ attemptId: once })),
        before,
      ];
    const reply = replyTo(found, argv);
    return [
      Result.succeed(reply),
      { ...before, applied: new Map(before.applied).set(once, reply.stdout) },
    ];
  };
}

function replyTo(
  found: MachineInMemory,
  argv: RemoteCommand["argv"],
): RemoteReply {
  return (
    found.reply?.(argv) ?? {
      exitCode: 127,
      stdout: "",
      stderr: `${argv[0]}: not scripted`,
    }
  );
}

function lookingUp(
  attemptId: AttemptId,
): Step<PositiveEvidence | RefutingEvidence> {
  return (before) => {
    const result = before.applied.get(attemptId);
    return result === undefined
      ? [
          Result.succeed({
            _tag: "RefutingEvidence",
            attemptId,
            reason: "not applied there, and now refused there",
          }),
          { ...before, refused: new Set(before.refused).add(attemptId) },
        ]
      : [
          Result.succeed({ _tag: "PositiveEvidence", attemptId, result }),
          before,
        ];
  };
}

const seam = "RemoteMachines";

export class RemoteMachines extends Context.Service<
  RemoteMachines,
  RemoteMachinesShape
>()("RemoteMachines") {
  static readonly layer = Layer.effect(
    RemoteMachines,
    Effect.as(HerdrCore, {
      ensureInstalled: () => notBuilt(seam, "ensureInstalled"),
      probeHealth: () => notBuilt(seam, "probeHealth"),
      runCommand: () => notBuilt(seam, "runCommand"),
      lookUpAttempt: () => notBuilt(seam, "lookUpAttempt"),
      observeJob: () => notBuilt(seam, "observeJob"),
    }),
  );

  static layerTestWith(
    script: RemoteMachinesTestScript,
  ): Layer.Layer<RemoteMachines> {
    return Layer.effect(
      RemoteMachines,
      Effect.gen(function* () {
        const there = yield* Ref.make<There>({
          installed: {},
          applied: new Map(),
          refused: new Set(),
        });
        const reached = (
          machine: string,
        ): Effect.Effect<MachineInMemory, MachineUnreachable> => {
          const found = script.machines[machine];
          return found === undefined
            ? Effect.fail(new MachineUnreachable({ machine }))
            : Effect.succeed(found);
        };
        const change = <A, E>(step: Step<A, E>) =>
          Ref.modify(there, step).pipe(
            Effect.flatMap((answer) => Effect.fromResult(answer)),
          );

        return {
          ensureInstalled: (machine) =>
            Effect.flatMap(reached(machine), (found) =>
              change(installing(machine, found, script.bundleDigest)),
            ),
          probeHealth: (machine) =>
            Effect.map(reached(machine), ({ health }) => health),
          runCommand: (command) =>
            Effect.flatMap(reached(command.machine), (found) =>
              change(running(found, command)),
            ),
          lookUpAttempt: (machine, attemptId) =>
            Effect.andThen(reached(machine), change(lookingUp(attemptId))),
          observeJob: (machine, jobId, attemptId) =>
            Effect.map(reached(machine), ({ jobs }) => {
              const reply = jobs?.[jobId];
              return reply === undefined
                ? { _tag: "NoEvidence" }
                : {
                    _tag: "JobFinished",
                    evidence: {
                      _tag: "PositiveEvidence",
                      attemptId,
                      result: `${machine}/${jobId}`,
                    },
                    reply,
                  };
            }),
        };
      }),
    );
  }

  static readonly layerTest = RemoteMachines.layerTestWith({
    bundleDigest: "bundle-in-memory",
    machines: {},
  });
}
