import { Effect } from "effect";
import type { AttemptId } from "../src/domains/attempt/index.ts";
import {
  CliKernelJournal,
  type CliKernelJournalTestScript,
  type Intent,
  type Observation,
} from "../src/adapters/cli-kernel/index.ts";
import { attemptId } from "./attempt-fixtures.ts";

export const taskLaunch: Intent = {
  attemptId,
  conflictKey: "task:shepherdr%234",
  effects: [
    { effectId: "terminal", keyedByAttemptId: false },
    { effectId: "task-assignment", keyedByAttemptId: true },
  ],
  owner: { machine: "local", processId: 4242, processStartedAtMs: 1_000 },
  facts: { launchRevision: "r1", task: { key: "shepherdr#4", role: "worker" } },
};

export function utilityLaunch(id: AttemptId, conflictKey: string): Intent {
  return {
    ...taskLaunch,
    attemptId: id,
    conflictKey,
    effects: [{ effectId: "terminal", keyedByAttemptId: false }],
  };
}

export function onTestJournal<A, E>(
  program: Effect.Effect<A, E, CliKernelJournal>,
  script?: CliKernelJournalTestScript,
): Promise<A> {
  const layer =
    script === undefined
      ? CliKernelJournal.layerTest
      : CliKernelJournal.layerTestWith(script);
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

export function observed(
  id: AttemptId,
  effectId: string,
  observation: Observation,
  reply: Effect.Effect<string, string> = Effect.succeed("t50"),
) {
  return Effect.gen(function* () {
    const journal = yield* CliKernelJournal;
    return yield* journal.record({
      attemptId: id,
      effectId,
      perform: () => reply,
      observe: () => Effect.succeed(observation),
    });
  });
}

export const effectStates = Effect.gen(function* () {
  const journal = yield* CliKernelJournal;
  const unresolved = yield* journal.unresolved();
  return unresolved.map(({ intent, effects }) => ({
    attemptId: intent.attemptId,
    effects: Object.fromEntries(
      Object.entries(effects).map(([effectId, attempt]) => [
        effectId,
        attempt._tag,
      ]),
    ),
  }));
});
