import { Context, Data, Effect, Layer, Ref, Result, type Schema } from "effect";
import {
  type Attempt,
  type AttemptEvent,
  type AttemptId,
  type AttemptRefusal,
  type PositiveEvidence,
  type RefutingEvidence,
  transitionAttempt,
} from "../../domains/attempt/index.ts";
import { type NotBuilt, notBuilt } from "../not-built.ts";

export interface AttemptOwner {
  readonly machine: string;
  readonly processId: number;
  readonly processStartedAtMs: number;
}

export interface DeclaredEffect {
  readonly effectId: string;
  readonly keyedByAttemptId: boolean;
}

export interface Intent {
  readonly attemptId: AttemptId;
  readonly conflictKey: string;
  readonly effects: readonly [DeclaredEffect, ...DeclaredEffect[]];
  readonly owner: AttemptOwner;
  readonly facts: Readonly<Record<string, Schema.Json>>;
}

type Uncertain = Extract<Attempt, { readonly _tag: "Uncertain" }>;

export type Observation =
  | PositiveEvidence
  | RefutingEvidence
  | { readonly _tag: "NoEvidence" }
  | { readonly _tag: "Unobservable" };

interface UnresolvedAttempt {
  readonly intent: Intent;
  readonly effects: Readonly<Record<string, Attempt>>;
}

interface Completed {
  readonly disposition: "completed";
  readonly by: "person" | "scheduler";
  readonly evidence: Readonly<Record<string, PositiveEvidence>>;
}

type NotApplied =
  | {
      readonly disposition: "not-applied";
      readonly by: "attempt-owner";
      readonly reason: string;
    }
  | {
      readonly disposition: "not-applied";
      readonly by: "person";
      readonly reason: string;
      readonly evidence: Readonly<Record<string, RefutingEvidence>>;
    };

type Closure = Completed | NotApplied;

class ConflictingAttempt extends Data.TaggedError("ConflictingAttempt")<{
  readonly unresolved: AttemptId;
}> {}

class AttemptNotFound extends Data.TaggedError("AttemptNotFound")<{
  readonly attemptId: AttemptId;
}> {}

class EffectNotDeclared extends Data.TaggedError("EffectNotDeclared")<{
  readonly attemptId: AttemptId;
  readonly effectId: string;
}> {}

class AttemptRefused extends Data.TaggedError("AttemptRefused")<{
  readonly effectId: string;
  readonly refusal: AttemptRefusal;
}> {}

class CallerMayNotClose extends Data.TaggedError("CallerMayNotClose")<{
  readonly effectId: string;
  readonly by: "scheduler";
  readonly state: Attempt["_tag"];
}> {}

class EvidenceMissing extends Data.TaggedError("EvidenceMissing")<{
  readonly effectId: string;
}> {}

class JournalUnreadable extends Data.TaggedError("JournalUnreadable")<{
  readonly reason: string;
}> {}

interface RecordedEffect<A, E> {
  readonly attemptId: AttemptId;
  readonly effectId: string;
  readonly perform: (uncertain: Uncertain) => Effect.Effect<A, E>;
  readonly observe: (reply: Result.Result<A, E>) => Effect.Effect<Observation>;
}

interface CliKernelJournalShape {
  readonly begin: (
    intent: Intent,
  ) => Effect.Effect<
    Attempt,
    ConflictingAttempt | JournalUnreadable | NotBuilt
  >;
  readonly record: <A, E>(
    recorded: RecordedEffect<A, E>,
  ) => Effect.Effect<
    Attempt,
    | AttemptNotFound
    | EffectNotDeclared
    | AttemptRefused
    | JournalUnreadable
    | NotBuilt
  >;
  readonly unresolved: (
    conflictKey?: string,
  ) => Effect.Effect<
    ReadonlyArray<UnresolvedAttempt>,
    JournalUnreadable | NotBuilt
  >;
  readonly close: (
    attemptId: AttemptId,
    closure: Closure,
  ) => Effect.Effect<
    void,
    | AttemptNotFound
    | AttemptRefused
    | CallerMayNotClose
    | EvidenceMissing
    | JournalUnreadable
    | NotBuilt
  >;
}

type Effects = Readonly<Record<string, Attempt>>;
type Cases = ReadonlyMap<AttemptId, UnresolvedAttempt>;
type Step<A, E> = readonly [Result.Result<A, E>, Cases];

function refused<A, E>(cases: Cases, failure: E): Step<A, E> {
  return [Result.fail(failure), cases];
}

function begun(intent: Intent): UnresolvedAttempt {
  return {
    intent,
    effects: Object.fromEntries(
      intent.effects.map(({ effectId }) => [
        effectId,
        { _tag: "Intended", id: intent.attemptId },
      ]),
    ),
  };
}

function beginning(
  intent: Intent,
): (cases: Cases) => Step<Attempt, ConflictingAttempt> {
  return (cases) => {
    const conflicting = [...cases.values()].find(
      (unresolved) =>
        unresolved.intent.conflictKey === intent.conflictKey ||
        unresolved.intent.attemptId === intent.attemptId,
    );
    if (conflicting !== undefined)
      return refused(
        cases,
        new ConflictingAttempt({ unresolved: conflicting.intent.attemptId }),
      );
    return [
      Result.succeed({ _tag: "Intended", id: intent.attemptId }),
      new Map(cases).set(intent.attemptId, begun(intent)),
    ];
  };
}

function everyEffectConfirmed(effects: Effects): boolean {
  return Object.values(effects).every(
    (attempt) => attempt._tag === "Confirmed",
  );
}

function withEffects(
  cases: Cases,
  unresolved: UnresolvedAttempt,
  effects: Effects,
): Cases {
  const next = new Map(cases);
  if (everyEffectConfirmed(effects)) next.delete(unresolved.intent.attemptId);
  else next.set(unresolved.intent.attemptId, { ...unresolved, effects });
  return next;
}

function applying(
  before: Attempt,
  events: ReadonlyArray<AttemptEvent>,
): Result.Result<Attempt, AttemptRefusal> {
  let attempt: Result.Result<Attempt, AttemptRefusal> = Result.succeed(before);
  for (const event of events)
    attempt = Result.flatMap(attempt, (state) =>
      transitionAttempt(state, event),
    );
  return attempt;
}

function recording(
  attemptId: AttemptId,
  effectId: string,
  events: ReadonlyArray<AttemptEvent>,
): (
  cases: Cases,
) => Step<Attempt, AttemptNotFound | EffectNotDeclared | AttemptRefused> {
  return (cases) => {
    const unresolved = cases.get(attemptId);
    if (unresolved === undefined)
      return refused(cases, new AttemptNotFound({ attemptId }));
    const before = unresolved.effects[effectId];
    if (before === undefined)
      return refused(cases, new EffectNotDeclared({ attemptId, effectId }));
    const after = applying(before, events);
    if (Result.isFailure(after))
      return refused(
        cases,
        new AttemptRefused({ effectId, refusal: after.failure }),
      );
    return [
      Result.succeed(after.success),
      withEffects(cases, unresolved, {
        ...unresolved.effects,
        [effectId]: after.success,
      }),
    ];
  };
}

function eventsOf(observation: Observation): ReadonlyArray<AttemptEvent> {
  switch (observation._tag) {
    case "PositiveEvidence":
      return [{ _tag: "Confirm", evidence: observation }];
    case "RefutingEvidence":
      return [{ _tag: "Refute", evidence: observation }];
    case "NoEvidence":
    case "Unobservable":
      return [];
  }
}

function keyedByAttemptId({ effects }: Intent): ReadonlySet<string> {
  return new Set(
    effects
      .filter((declared) => declared.keyedByAttemptId)
      .map(({ effectId }) => effectId),
  );
}

function notAppliedEvents(
  effectId: string,
  attempt: Attempt,
  closure: NotApplied,
): ReadonlyArray<AttemptEvent> {
  if (attempt._tag === "Refuted") return [];
  const evidence =
    closure.by === "person" ? closure.evidence[effectId] : undefined;
  return attempt._tag === "Uncertain" && evidence !== undefined
    ? [{ _tag: "Refute", evidence }]
    : [{ _tag: "Cancel", by: closure.by, reason: closure.reason }];
}

function completedEvents(
  { effectId, keyedByAttemptId }: DeclaredEffect,
  attempt: Attempt,
  closure: Completed,
): Result.Result<
  ReadonlyArray<AttemptEvent>,
  CallerMayNotClose | EvidenceMissing
> {
  if (attempt._tag === "Confirmed") return Result.succeed([]);
  if (closure.by === "scheduler" && !keyedByAttemptId)
    return Result.fail(
      new CallerMayNotClose({
        effectId,
        by: closure.by,
        state: attempt._tag,
      }),
    );
  const evidence = closure.evidence[effectId];
  if (evidence === undefined)
    return Result.fail(new EvidenceMissing({ effectId }));
  const confirm: AttemptEvent = { _tag: "Confirm", evidence };
  return Result.succeed(
    attempt._tag === "Intended" && keyedByAttemptId
      ? [{ _tag: "EffectStarted" }, confirm]
      : [confirm],
  );
}

function closureEventsFor(
  declared: DeclaredEffect,
  attempt: Attempt,
  closure: Closure,
): Result.Result<
  ReadonlyArray<AttemptEvent>,
  CallerMayNotClose | EvidenceMissing
> {
  return closure.disposition === "completed"
    ? completedEvents(declared, attempt, closure)
    : Result.succeed(notAppliedEvents(declared.effectId, attempt, closure));
}

function closing(
  attemptId: AttemptId,
  closure: Closure,
): (
  cases: Cases,
) => Step<
  void,
  AttemptNotFound | AttemptRefused | CallerMayNotClose | EvidenceMissing
> {
  return (cases) => {
    const unresolved = cases.get(attemptId);
    if (unresolved === undefined)
      return refused(cases, new AttemptNotFound({ attemptId }));
    const keyed = keyedByAttemptId(unresolved.intent);
    for (const [effectId, attempt] of Object.entries(unresolved.effects)) {
      const events = closureEventsFor(
        { effectId, keyedByAttemptId: keyed.has(effectId) },
        attempt,
        closure,
      );
      if (Result.isFailure(events)) return refused(cases, events.failure);
      const after = applying(attempt, events.success);
      if (Result.isFailure(after))
        return refused(
          cases,
          new AttemptRefused({ effectId, refusal: after.failure }),
        );
    }
    const next = new Map(cases);
    next.delete(attemptId);
    return [Result.succeed(undefined), next];
  };
}

export interface CliKernelJournalTestScript {
  readonly unreadable?: string;
}

const seam = "CliKernelJournal";

export class CliKernelJournal extends Context.Service<
  CliKernelJournal,
  CliKernelJournalShape
>()("CliKernelJournal") {
  static readonly layer = Layer.succeed(CliKernelJournal, {
    begin: () => notBuilt(seam, "begin"),
    record: () => notBuilt(seam, "record"),
    unresolved: () => notBuilt(seam, "unresolved"),
    close: () => notBuilt(seam, "close"),
  });

  static layerTestWith(
    script: CliKernelJournalTestScript,
  ): Layer.Layer<CliKernelJournal> {
    return Layer.effect(
      CliKernelJournal,
      Effect.gen(function* () {
        const journal = yield* Ref.make<Cases>(new Map());
        const readable =
          script.unreadable === undefined
            ? Effect.void
            : Effect.fail(new JournalUnreadable({ reason: script.unreadable }));
        const step = <A, E>(change: (cases: Cases) => Step<A, E>) =>
          readable.pipe(
            Effect.andThen(Ref.modify(journal, change)),
            Effect.flatMap((result) => Effect.fromResult(result)),
          );
        return {
          begin: (intent) => step(beginning(intent)),
          record: ({ attemptId, effectId, perform, observe }) =>
            Effect.gen(function* () {
              yield* step(
                recording(attemptId, effectId, [{ _tag: "EffectStarted" }]),
              );
              const reply = yield* Effect.result(
                perform({ _tag: "Uncertain", id: attemptId }),
              );
              const observation = yield* observe(reply);
              return yield* step(
                recording(attemptId, effectId, eventsOf(observation)),
              );
            }),
          unresolved: (conflictKey) =>
            readable.pipe(
              Effect.andThen(Ref.get(journal)),
              Effect.map((cases) =>
                [...cases.values()].filter(
                  (unresolved) =>
                    conflictKey === undefined ||
                    unresolved.intent.conflictKey === conflictKey,
                ),
              ),
            ),
          close: (attemptId, closure) => step(closing(attemptId, closure)),
        };
      }),
    );
  }

  static readonly layerTest = CliKernelJournal.layerTestWith({});
}
