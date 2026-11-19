import { expect, test } from "bun:test";
import { Deferred, Effect, Fiber, Result } from "effect";
import { CliKernelJournal } from "../src/adapters/cli-kernel/index.ts";
import type {
  Attempt,
  RefutingEvidence,
} from "../src/domains/attempt/index.ts";
import { failureOf, refusedWith, unbuiltEntryOf } from "./adapter-fixtures.ts";
import {
  anotherAttemptId,
  attemptId,
  nothingReachedFor,
  terminalFor,
} from "./attempt-fixtures.ts";
import {
  effectStates,
  observed,
  onTestJournal,
  ownerStopped,
  taskLaunch,
  utilityLaunch,
} from "./kernel-journal-fixtures.ts";

const noEvidence = { _tag: "NoEvidence" } as const;
const journal = CliKernelJournal;

test("begin records the intent with every declared effect Intended", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const begun = yield* (yield* journal).begin(taskLaunch);
      return { begun, unresolved: yield* (yield* journal).unresolved() };
    }),
  );

  const intended: Attempt = { _tag: "Intended", id: attemptId };
  expect(seen).toEqual({
    begun: intended,
    unresolved: [
      {
        intent: taskLaunch,
        effects: { terminal: intended, "task-assignment": intended },
      },
    ],
  });
});

test("a second begin on an unresolved conflict key is refused, naming the unresolved attempt", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      yield* (yield* journal).begin(taskLaunch);
      const refusal = yield* Effect.flip(
        (yield* journal).begin(
          utilityLaunch(anotherAttemptId, taskLaunch.conflictKey),
        ),
      );
      yield* (yield* journal).begin(
        utilityLaunch(anotherAttemptId, "scheduler:local"),
      );
      const unresolved = yield* (yield* journal).unresolved("scheduler:local");
      return {
        refusal: failureOf(refusal),
        scheduler: unresolved.map(({ intent }) => intent.attemptId),
      };
    }),
  );

  expect(seen).toEqual({
    refusal: { _tag: "ConflictingAttempt", unresolved: attemptId },
    scheduler: [anotherAttemptId],
  });
});

test("the effect is recorded as started before it is performed, and is handed the Uncertain attempt", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      yield* (yield* journal).begin(taskLaunch);
      const service = yield* journal;
      const during: unknown[] = [];
      yield* service.record({
        attemptId,
        effectId: "terminal",
        perform: (uncertain) =>
          effectStates.pipe(
            Effect.provideService(journal, service),
            Effect.map((states) => during.push({ uncertain, states })),
            Effect.orDie,
          ),
        observe: () => Effect.succeed(noEvidence),
      });
      return during;
    }),
  );

  expect(seen).toEqual([
    {
      uncertain: { _tag: "Uncertain", id: attemptId },
      states: [
        {
          attemptId,
          effects: { terminal: "Uncertain", "task-assignment": "Intended" },
        },
      ],
    },
  ]);
});

test("a task launch stays unresolved after its terminal is confirmed, and completes when its task assignment is", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      yield* (yield* journal).begin(taskLaunch);
      const terminal = yield* observed(
        attemptId,
        "terminal",
        terminalFor(attemptId),
      );
      const afterTerminal = yield* effectStates;
      yield* observed(
        attemptId,
        "task-assignment",
        terminalFor(attemptId, "agent row"),
      );
      yield* (yield* journal).begin(
        utilityLaunch(anotherAttemptId, taskLaunch.conflictKey),
      );
      return { terminal, afterTerminal, afterBoth: yield* effectStates };
    }),
  );

  expect(seen).toEqual({
    terminal: {
      _tag: "Confirmed",
      id: attemptId,
      evidence: { _tag: "PositiveEvidence", attemptId, result: "t50" },
    },
    afterTerminal: [
      {
        attemptId,
        effects: { terminal: "Confirmed", "task-assignment": "Intended" },
      },
    ],
    afterBoth: [
      { attemptId: anotherAttemptId, effects: { terminal: "Intended" } },
    ],
  });
});

test("an Uncertain effect is never performed again, and evidence for another attempt does not confirm it", async () => {
  const performed: string[] = [];
  const seen = await onTestJournal(
    Effect.gen(function* () {
      yield* (yield* journal).begin(taskLaunch);
      const perform = () => Effect.sync(() => performed.push("sent"));
      const first = yield* (yield* journal).record({
        attemptId,
        effectId: "terminal",
        perform,
        observe: () => Effect.succeed({ _tag: "Unobservable" }),
      });
      const again = yield* Effect.flip(
        (yield* journal).record({
          attemptId,
          effectId: "terminal",
          perform,
          observe: () => Effect.succeed(terminalFor(attemptId)),
        }),
      );
      const foreign = yield* Effect.flip(
        observed(attemptId, "task-assignment", terminalFor(anotherAttemptId)),
      );
      return {
        first: first._tag,
        again: failureOf(again),
        foreign: failureOf(foreign),
        states: yield* effectStates,
      };
    }),
  );

  expect(performed).toEqual(["sent"]);
  expect(seen).toEqual({
    first: "Uncertain",
    again: {
      _tag: "AttemptRefused",
      effectId: "terminal",
      refusal: {
        _tag: "UncertainNeverRetried",
        state: "Uncertain",
        event: "EffectStarted",
      },
    },
    foreign: {
      _tag: "AttemptRefused",
      effectId: "task-assignment",
      refusal: {
        _tag: "EvidenceForAnotherAttempt",
        state: "Uncertain",
        event: "Confirm",
      },
    },
    states: [
      {
        attemptId,
        effects: { terminal: "Uncertain", "task-assignment": "Uncertain" },
      },
    ],
  });
});

test("an effect interrupted at the deadline stays Uncertain", async () => {
  const states = await onTestJournal(
    Effect.gen(function* () {
      yield* (yield* journal).begin(taskLaunch);
      const sent = yield* Deferred.make<void>();
      const recording = yield* (yield* journal)
        .record({
          attemptId,
          effectId: "terminal",
          perform: () =>
            Deferred.succeed(sent, undefined).pipe(
              Effect.andThen(Effect.never),
            ),
          observe: () => Effect.succeed(terminalFor(attemptId)),
        })
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Deferred.await(sent);
      yield* Fiber.interrupt(recording);
      return yield* effectStates;
    }),
  );

  expect(states).toEqual([
    {
      attemptId,
      effects: { terminal: "Uncertain", "task-assignment": "Intended" },
    },
  ]);
});

test("a refuting reply leaves the effect Refuted, and the attempt closes as not applied", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(utilityLaunch(attemptId, "scheduler:local"));
      const refuted = yield* service.record({
        attemptId,
        effectId: "terminal",
        perform: () => Effect.fail("link lost before the call"),
        observe: (reply) =>
          Effect.succeed(
            Result.isFailure(reply) ? nothingReachedFor(attemptId) : noEvidence,
          ),
      });
      const before = yield* effectStates;
      yield* service.close(attemptId, {
        disposition: "not-applied",
        by: "attempt-owner",
        reason: "nothing reached herdr-core",
      });
      return { refuted: refuted._tag, before, after: yield* effectStates };
    }),
  );

  expect(seen).toEqual({
    refuted: "Refuted",
    before: [{ attemptId, effects: { terminal: "Refuted" } }],
    after: [],
  });
});

test("closing as not applied frees an Intended attempt, and an Uncertain one only on the person's refuting evidence for it", async () => {
  const recover = {
    disposition: "not-applied",
    by: "person",
    reason: "launch recover",
    evidence: {},
  } as const;
  const refuting = (evidence: RefutingEvidence) =>
    ({
      disposition: "not-applied",
      by: "person",
      reason: "herdr-core can no longer apply the request",
      evidence: { terminal: evidence },
    }) as const;
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(taskLaunch);
      yield* service.close(attemptId, recover);
      const freed = yield* effectStates;
      yield* service.begin(taskLaunch);
      yield* observed(attemptId, "terminal", noEvidence);
      const onNoEvidence = yield* refusedWith(
        service.close(attemptId, recover),
      );
      const byItsOwnRun = yield* refusedWith(
        service.close(attemptId, {
          disposition: "not-applied",
          by: "attempt-owner",
          reason: "no labelled terminal shows",
        }),
      );
      const forAnotherAttempt = yield* refusedWith(
        service.close(attemptId, refuting(nothingReachedFor(anotherAttemptId))),
      );
      const kept = yield* effectStates;
      const onRefutingEvidence = yield* refusedWith(
        service.close(attemptId, refuting(nothingReachedFor(attemptId))),
      );
      const after = yield* effectStates;
      const startedAgain = yield* refusedWith(service.begin(taskLaunch));
      return {
        freed,
        onNoEvidence,
        byItsOwnRun,
        forAnotherAttempt,
        kept,
        onRefutingEvidence,
        after,
        startedAgain,
      };
    }),
    ownerStopped,
  );

  const neverCancelled = {
    _tag: "AttemptRefused",
    effectId: "terminal",
    refusal: {
      _tag: "UncertainNeverCancelled",
      state: "Uncertain",
      event: "Cancel",
    },
  };
  expect(seen).toEqual({
    freed: [],
    onNoEvidence: neverCancelled,
    byItsOwnRun: neverCancelled,
    forAnotherAttempt: {
      _tag: "AttemptRefused",
      effectId: "terminal",
      refusal: {
        _tag: "EvidenceForAnotherAttempt",
        state: "Uncertain",
        event: "Refute",
      },
    },
    kept: [
      {
        attemptId,
        effects: { terminal: "Uncertain", "task-assignment": "Intended" },
      },
    ],
    onRefutingEvidence: "not refused",
    after: [],
    startedAgain: "not refused",
  });
});

test("a run other than the attempt owner closes an attempt only once its attempt owner has stopped", async () => {
  const running = {
    machine: "local",
    processId: 5151,
    processStartedAtMs: 2_000,
  };
  const recover = {
    disposition: "not-applied",
    by: "person",
    reason: "launch recover",
    evidence: {},
  } as const;
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(taskLaunch);
      yield* service.begin({
        ...utilityLaunch(anotherAttemptId, "scheduler:local"),
        owner: running,
      });
      const person = yield* refusedWith(
        service.close(anotherAttemptId, recover),
      );
      const scheduler = yield* refusedWith(
        service.close(anotherAttemptId, {
          disposition: "completed",
          by: "scheduler",
          evidence: {},
        }),
      );
      const kept = yield* effectStates;
      const itsOwnRun = yield* refusedWith(
        service.close(anotherAttemptId, {
          disposition: "not-applied",
          by: "attempt-owner",
          reason: "the launch revision changed",
        }),
      );
      const afterItsOwnRun = yield* effectStates;
      const ownerStopped = yield* refusedWith(
        service.close(attemptId, recover),
      );
      return {
        person,
        scheduler,
        kept,
        itsOwnRun,
        afterItsOwnRun,
        ownerStopped,
        after: yield* effectStates,
      };
    }),
    { attemptOwnerStopped: (owner) => owner.processId === 4242 },
  );

  const mayBeRunning = {
    _tag: "AttemptOwnerMayBeRunning",
    attemptId: anotherAttemptId,
    owner: { machine: "local", processId: 5151, processStartedAtMs: 2_000 },
  };
  const taskLaunchIntended = {
    attemptId,
    effects: { terminal: "Intended", "task-assignment": "Intended" },
  } as const;
  expect(seen).toEqual({
    person: mayBeRunning,
    scheduler: mayBeRunning,
    kept: [
      taskLaunchIntended,
      { attemptId: anotherAttemptId, effects: { terminal: "Intended" } },
    ],
    itsOwnRun: "not refused",
    afterItsOwnRun: [taskLaunchIntended],
    ownerStopped: "not refused",
    after: [],
  });
});

test("closing as completed needs positive evidence for every effect not yet confirmed", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(taskLaunch);
      yield* observed(attemptId, "terminal", noEvidence);
      const missing = yield* Effect.flip(
        service.close(attemptId, {
          disposition: "completed",
          by: "person",
          evidence: { terminal: terminalFor(attemptId) },
        }),
      );
      const kept = yield* effectStates;
      yield* service.close(attemptId, {
        disposition: "completed",
        by: "person",
        evidence: {
          terminal: terminalFor(attemptId),
          "task-assignment": terminalFor(attemptId, "agent row"),
        },
      });
      return { missing: failureOf(missing), kept, after: yield* effectStates };
    }),
    ownerStopped,
  );

  expect(seen).toEqual({
    missing: { _tag: "EvidenceMissing", effectId: "task-assignment" },
    kept: [
      {
        attemptId,
        effects: { terminal: "Uncertain", "task-assignment": "Intended" },
      },
    ],
    after: [],
  });
});

test("closing as completed confirms an effect that never started only when its intent declares it keyed by the attempt id", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(utilityLaunch(anotherAttemptId, "scheduler:local"));
      const neverStarted = yield* refusedWith(
        service.close(anotherAttemptId, {
          disposition: "completed",
          by: "person",
          evidence: { terminal: terminalFor(anotherAttemptId) },
        }),
      );
      const kept = yield* effectStates;
      yield* service.begin(taskLaunch);
      yield* observed(attemptId, "terminal", terminalFor(attemptId));
      yield* service.close(attemptId, {
        disposition: "completed",
        by: "person",
        evidence: { "task-assignment": terminalFor(attemptId, "agent row") },
      });
      return {
        neverStarted,
        kept,
        after: yield* effectStates,
      };
    }),
    ownerStopped,
  );

  expect(seen).toEqual({
    neverStarted: {
      _tag: "AttemptRefused",
      effectId: "terminal",
      refusal: {
        _tag: "EffectNotStarted",
        state: "Intended",
        event: "Confirm",
      },
    },
    kept: [{ attemptId: anotherAttemptId, effects: { terminal: "Intended" } }],
    after: [{ attemptId: anotherAttemptId, effects: { terminal: "Intended" } }],
  });
});

test("only the person closes an Uncertain launch as completed, and the scheduler finishes one whose terminal is Confirmed", async () => {
  const bothEffects = {
    terminal: terminalFor(attemptId),
    "task-assignment": terminalFor(attemptId, "agent row"),
  };
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(taskLaunch);
      yield* observed(attemptId, "terminal", noEvidence);
      const scheduler = yield* refusedWith(
        service.close(attemptId, {
          disposition: "completed",
          by: "scheduler",
          evidence: bothEffects,
        }),
      );
      const kept = yield* effectStates;
      const person = yield* refusedWith(
        service.close(attemptId, {
          disposition: "completed",
          by: "person",
          evidence: bothEffects,
        }),
      );
      const afterPerson = yield* effectStates;
      yield* service.begin(taskLaunch);
      yield* observed(attemptId, "terminal", terminalFor(attemptId));
      yield* observed(attemptId, "task-assignment", noEvidence);
      const confirmed = yield* refusedWith(
        service.close(attemptId, {
          disposition: "completed",
          by: "scheduler",
          evidence: { "task-assignment": terminalFor(attemptId, "agent row") },
        }),
      );
      return {
        scheduler,
        kept,
        person,
        afterPerson,
        confirmed,
        afterScheduler: yield* effectStates,
      };
    }),
    ownerStopped,
  );

  expect(seen).toEqual({
    scheduler: {
      _tag: "CallerMayNotClose",
      effectId: "terminal",
      by: "scheduler",
      state: "Uncertain",
    },
    kept: [
      {
        attemptId,
        effects: { terminal: "Uncertain", "task-assignment": "Intended" },
      },
    ],
    person: "not refused",
    afterPerson: [],
    confirmed: "not refused",
    afterScheduler: [],
  });
});

test("an attempt the journal does not hold, and an effect its intent did not declare, are refused by name", async () => {
  const seen = await onTestJournal(
    Effect.gen(function* () {
      const service = yield* journal;
      yield* service.begin(taskLaunch);
      const unknownRecord = yield* Effect.flip(
        observed(anotherAttemptId, "terminal", noEvidence),
      );
      const unknownClose = yield* Effect.flip(
        service.close(anotherAttemptId, {
          disposition: "completed",
          by: "person",
          evidence: {},
        }),
      );
      const undeclared = yield* Effect.flip(
        observed(attemptId, "push", noEvidence),
      );
      return [unknownRecord, unknownClose, undeclared].map(failureOf);
    }),
  );

  expect(seen).toEqual([
    { _tag: "AttemptNotFound", attemptId: anotherAttemptId },
    { _tag: "AttemptNotFound", attemptId: anotherAttemptId },
    { _tag: "EffectNotDeclared", attemptId, effectId: "push" },
  ]);
});

function eachEntry() {
  return Effect.gen(function* () {
    const service = yield* journal;
    return yield* Effect.all([
      Effect.flip(service.begin(taskLaunch)),
      Effect.flip(observed(attemptId, "terminal", noEvidence)),
      Effect.flip(service.unresolved()),
      Effect.flip(
        service.close(attemptId, {
          disposition: "completed",
          by: "person",
          evidence: {},
        }),
      ),
    ]);
  });
}

test("an unreadable journal refuses every entry and is never read as empty", async () => {
  const refusals = await onTestJournal(eachEntry(), {
    unreadable: "a record's frame is cut short",
  });

  const unreadable = {
    _tag: "JournalUnreadable",
    reason: "a record's frame is cut short",
  };
  expect(refusals.map(failureOf)).toEqual([
    unreadable,
    unreadable,
    unreadable,
    unreadable,
  ]);
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    eachEntry().pipe(Effect.provide(CliKernelJournal.layer)),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: CliKernelJournal.begin",
    "NotBuilt: CliKernelJournal.record",
    "NotBuilt: CliKernelJournal.unresolved",
    "NotBuilt: CliKernelJournal.close",
  ]);
});
