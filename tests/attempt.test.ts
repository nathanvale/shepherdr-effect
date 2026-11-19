import { expect, test } from "bun:test";
import { Result, Schema } from "effect";
import {
  Attempt,
  type AttemptEvent,
  attemptTransitions,
  transitionAttempt,
} from "../src/domains/attempt/index.ts";
import {
  anotherAttemptId,
  attemptId,
  eventsWithoutEvidence,
  intended,
  nothingReachedFor,
  refusalOf,
  stateAfter,
  terminalFor,
  uncertain,
} from "./attempt-fixtures.ts";

const STATES = [
  "Intended",
  "Uncertain",
  "Confirmed",
  "Refuted",
  "Cancelled",
] as const;
const EVENTS = ["EffectStarted", "Confirm", "Refute", "Cancel"] as const;

type State = (typeof STATES)[number];
type Event = (typeof EVENTS)[number];

const RESOLVED = {
  EffectStarted: "refused: AttemptResolved",
  Confirm: "refused: AttemptResolved",
  Refute: "refused: AttemptResolved",
  Cancel: "refused: AttemptResolved",
} as const;

const EXPECTED: Record<State, Record<Event, string>> = {
  Intended: {
    EffectStarted: "Uncertain",
    Confirm: "refused: EffectNotStarted",
    Refute: "refused: EffectNotStarted",
    Cancel: "Cancelled",
  },
  Uncertain: {
    EffectStarted: "refused: UncertainNeverRetried",
    Confirm: "Confirmed",
    Refute: "Refuted",
    Cancel: "refused: UncertainNeverCancelled",
  },
  Confirmed: RESOLVED,
  Refuted: RESOLVED,
  Cancelled: RESOLVED,
};

const attemptIn: Record<State, Attempt> = {
  Intended: intended,
  Uncertain: uncertain,
  Confirmed: {
    _tag: "Confirmed",
    id: attemptId,
    evidence: terminalFor(attemptId),
  },
  Refuted: {
    _tag: "Refuted",
    id: attemptId,
    evidence: nothingReachedFor(attemptId),
  },
  Cancelled: {
    _tag: "Cancelled",
    id: attemptId,
    by: "person",
    reason: "launch recover",
  },
};

const eventOf: Record<Event, AttemptEvent> = {
  EffectStarted: { _tag: "EffectStarted" },
  Confirm: { _tag: "Confirm", evidence: terminalFor(attemptId) },
  Refute: { _tag: "Refute", evidence: nothingReachedFor(attemptId) },
  Cancel: { _tag: "Cancel", by: "attempt-owner", reason: "its run gave up" },
};

function outcomeOf(attempt: Attempt, event: AttemptEvent): string {
  const result = transitionAttempt(attempt, event);
  return Result.isSuccess(result)
    ? result.success._tag
    : `refused: ${result.failure._tag}`;
}

function cellText(state: State, event: Event): string {
  const cell = attemptTransitions[state][event];
  return cell.to ?? `refused: ${cell.refusal}`;
}

const pairs = STATES.flatMap((state) =>
  EVENTS.map((event) => [state, event] as const),
);

test("the attempt table has five states and four events", () => {
  expect(Object.keys(attemptTransitions)).toEqual([...STATES]);
  for (const state of STATES)
    expect(Object.keys(attemptTransitions[state])).toEqual([...EVENTS]);
  expect(pairs).toHaveLength(20);
});

test.each(pairs)(
  "%s on %s gives the next state or the refusal the design names",
  (state, event) => {
    expect(outcomeOf(attemptIn[state], eventOf[event])).toBe(
      EXPECTED[state][event],
    );
    expect(cellText(state, event)).toBe(EXPECTED[state][event]);
  },
);

test("an attempt keeps its attempt id through every transition", () => {
  const moved = pairs.flatMap(([state, event]) => {
    const result = transitionAttempt(attemptIn[state], eventOf[event]);
    return Result.isSuccess(result) ? [result.success.id] : [];
  });
  expect(moved).toEqual([attemptId, attemptId, attemptId, attemptId]);
});

test("nothing moves an Uncertain attempt without evidence", () => {
  expect(
    eventsWithoutEvidence.map((event) => refusalOf(uncertain, event)),
  ).toEqual([
    "UncertainNeverRetried",
    "UncertainNeverCancelled",
    "UncertainNeverCancelled",
  ]);
});

test("every way out of Uncertain carries evidence for that attempt", () => {
  const waysOut = EVENTS.filter(
    (event) => attemptTransitions.Uncertain[event].to !== undefined,
  );
  expect(waysOut).toEqual(["Confirm", "Refute"]);
  expect(stateAfter(uncertain, eventOf.Confirm)).toEqual({
    _tag: "Confirmed",
    id: attemptId,
    evidence: terminalFor(attemptId),
  });
  expect(stateAfter(uncertain, eventOf.Refute)).toEqual({
    _tag: "Refuted",
    id: attemptId,
    evidence: nothingReachedFor(attemptId),
  });
});

test.each([
  ["Confirm", { _tag: "Confirm", evidence: terminalFor(anotherAttemptId) }],
  ["Refute", { _tag: "Refute", evidence: nothingReachedFor(anotherAttemptId) }],
] satisfies [string, AttemptEvent][])(
  "%s with evidence for another attempt is refused",
  (_event, event) => {
    expect(refusalOf(uncertain, event)).toBe("EvidenceForAnotherAttempt");
  },
);

test("a cancelled attempt records who cancelled it and why", () => {
  expect(
    stateAfter(intended, {
      _tag: "Cancel",
      by: "person",
      reason: "launch recover",
    }),
  ).toEqual({
    _tag: "Cancelled",
    id: attemptId,
    by: "person",
    reason: "launch recover",
  });
});

const decodes = (value: unknown) =>
  Result.isSuccess(Schema.decodeUnknownResult(Attempt)(value));

test("every stored attempt state decodes", () => {
  expect(STATES.filter((state) => !decodes(attemptIn[state]))).toEqual([]);
});

test.each([
  ["a Confirmed attempt without its evidence", { _tag: "Confirmed" }],
  [
    "a Confirmed attempt holding refuting evidence",
    { _tag: "Confirmed", evidence: nothingReachedFor(attemptId) },
  ],
  ["a Refuted attempt without its evidence", { _tag: "Refuted" }],
  [
    "a Cancelled attempt without who cancelled it",
    { _tag: "Cancelled", reason: "launch recover" },
  ],
  [
    "an attempt cancelled by the scheduler",
    { _tag: "Cancelled", by: "scheduler", reason: "its owner is gone" },
  ],
  ["an attempt in a sixth state", { _tag: "Retried" }],
])("%s does not decode", (_what, fields) => {
  expect(decodes({ id: attemptId, ...fields })).toBe(false);
});
