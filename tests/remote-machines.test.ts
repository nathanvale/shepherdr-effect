import { expect, test } from "bun:test";
import { Effect } from "effect";
import { HerdrCore } from "../src/adapters/herdr-core/index.ts";
import {
  RemoteMachines,
  type RemoteMachinesTestScript,
} from "../src/adapters/remote-machines/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";
import { anotherAttemptId, attemptId } from "./attempt-fixtures.ts";

const health = {
  load: 0.4,
  memoryAvailableMb: 9_000,
  diskAvailableMb: 120_000,
};
const script: RemoteMachinesTestScript = {
  bundleDigest: "bundle-9f2c",
  machines: {
    mini: {
      health,
      installedBundle: "bundle-0001",
      reply: (argv) => ({
        exitCode: 0,
        stdout: `ran ${argv.join(" ")}`,
        stderr: "",
      }),
      jobs: { j7: { exitCode: 0, stdout: "merged", stderr: "" } },
    },
    pilot: { health, installFailsAt: "write the runtime" },
  },
};

function onTestMachines<A, E>(
  program: Effect.Effect<A, E, RemoteMachines>,
): Promise<A> {
  return Effect.runPromise(
    program.pipe(Effect.provide(RemoteMachines.layerTestWith(script))),
  );
}

test("a remote install is written once for a bundle, and a failed step leaves the machine without it", async () => {
  const seen = await onTestMachines(
    Effect.gen(function* () {
      const machines = yield* RemoteMachines;
      return {
        first: yield* machines.ensureInstalled("mini"),
        second: yield* machines.ensureInstalled("mini"),
        failed: failureOf(
          yield* Effect.flip(machines.ensureInstalled("pilot")),
        ),
      };
    }),
  );

  expect(seen).toEqual({
    first: { bundleDigest: "bundle-9f2c", installed: "now" },
    second: { bundleDigest: "bundle-9f2c", installed: "already" },
    failed: {
      _tag: "RemoteInstallFailed",
      machine: "pilot",
      step: "write the runtime",
    },
  });
});

test("a health probe answers the machine's load, memory and disk", async () => {
  const probed = await onTestMachines(
    Effect.flatMap(RemoteMachines, (machines) => machines.probeHealth("mini")),
  );

  expect(probed).toEqual({
    load: 0.4,
    memoryAvailableMb: 9_000,
    diskAvailableMb: 120_000,
  });
});

test("a remote command sent once is found by its attempt id, and is never applied twice", async () => {
  const seen = await onTestMachines(
    Effect.gen(function* () {
      const machines = yield* RemoteMachines;
      const ready = {
        machine: "mini",
        argv: ["herdr-task", "ready", "HAT-4"],
      } as const;
      const reply = yield* machines.runCommand({ ...ready, once: attemptId });
      const again = yield* Effect.flip(
        machines.runCommand({ ...ready, once: attemptId }),
      );
      return {
        reply,
        again: failureOf(again),
        lookedUp: yield* machines.lookUpAttempt("mini", attemptId),
        safe: yield* machines.runCommand({
          machine: "pilot",
          argv: ["status"],
        }),
      };
    }),
  );

  expect(seen).toEqual({
    reply: { exitCode: 0, stdout: "ran herdr-task ready HAT-4", stderr: "" },
    again: { _tag: "RemoteCommandRefused", attemptId },
    lookedUp: {
      _tag: "PositiveEvidence",
      attemptId,
      result: "ran herdr-task ready HAT-4",
    },
    safe: { exitCode: 127, stdout: "", stderr: "status: not scripted" },
  });
});

test("looking up an attempt that was not applied refuses its late copy", async () => {
  const seen = await onTestMachines(
    Effect.gen(function* () {
      const machines = yield* RemoteMachines;
      const lookedUp = yield* machines.lookUpAttempt("mini", anotherAttemptId);
      const late = yield* Effect.flip(
        machines.runCommand({
          machine: "mini",
          argv: ["herdr-task", "ready", "HAT-4"],
          once: anotherAttemptId,
        }),
      );
      return {
        lookedUp,
        late: failureOf(late),
        still: yield* machines.lookUpAttempt("mini", anotherAttemptId),
      };
    }),
  );

  const refuted = {
    _tag: "RefutingEvidence",
    attemptId: anotherAttemptId,
    reason: "not applied there, and now refused there",
  } as const;
  expect(seen).toEqual({
    lookedUp: refuted,
    late: { _tag: "RemoteCommandRefused", attemptId: anotherAttemptId },
    still: refuted,
  });
});

test("a remote job is positive evidence only once its result is there", async () => {
  const seen = await onTestMachines(
    Effect.gen(function* () {
      const machines = yield* RemoteMachines;
      return {
        finished: yield* machines.observeJob("mini", "j7", attemptId),
        running: yield* machines.observeJob("mini", "j8", attemptId),
      };
    }),
  );

  expect(seen).toEqual({
    finished: {
      _tag: "JobFinished",
      evidence: { _tag: "PositiveEvidence", attemptId, result: "mini/j7" },
      reply: { exitCode: 0, stdout: "merged", stderr: "" },
    },
    running: { _tag: "NoEvidence" },
  });
});

const everyEntry = Effect.gen(function* () {
  const machines = yield* RemoteMachines;
  return yield* Effect.all([
    Effect.flip(machines.ensureInstalled("gone")),
    Effect.flip(machines.probeHealth("gone")),
    Effect.flip(machines.runCommand({ machine: "gone", argv: ["status"] })),
    Effect.flip(machines.lookUpAttempt("gone", attemptId)),
    Effect.flip(machines.observeJob("gone", "j7", attemptId)),
  ]);
});

test("a machine that is not reachable refuses every entry", async () => {
  const refusals = await Effect.runPromise(
    everyEntry.pipe(Effect.provide(RemoteMachines.layerTest)),
  );

  const refusal = { _tag: "MachineUnreachable", machine: "gone" };
  expect(refusals.map(failureOf)).toEqual(
    Array.from({ length: 5 }, () => refusal),
  );
});

test("the real layer needs the herdr-core link and answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    everyEntry.pipe(
      Effect.provide(RemoteMachines.layer),
      Effect.provide(HerdrCore.layerTest),
    ),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: RemoteMachines.ensureInstalled",
    "NotBuilt: RemoteMachines.probeHealth",
    "NotBuilt: RemoteMachines.runCommand",
    "NotBuilt: RemoteMachines.lookUpAttempt",
    "NotBuilt: RemoteMachines.observeJob",
  ]);
});
