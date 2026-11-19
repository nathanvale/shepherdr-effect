import { Result, Schema } from "effect";

export const AttemptId = Schema.NonEmptyString.pipe(Schema.brand("AttemptId"));
export type AttemptId = typeof AttemptId.Type;

const PositiveEvidence = Schema.TaggedStruct("PositiveEvidence", {
  attemptId: AttemptId,
  result: Schema.NonEmptyString,
});
export type PositiveEvidence = typeof PositiveEvidence.Type;

const RefutingEvidence = Schema.TaggedStruct("RefutingEvidence", {
  attemptId: AttemptId,
  reason: Schema.NonEmptyString,
});
export type RefutingEvidence = typeof RefutingEvidence.Type;

const Intended = Schema.TaggedStruct("Intended", { id: AttemptId });
const Uncertain = Schema.TaggedStruct("Uncertain", { id: AttemptId });
const Confirmed = Schema.TaggedStruct("Confirmed", {
  id: AttemptId,
  evidence: PositiveEvidence,
});
const Refuted = Schema.TaggedStruct("Refuted", {
  id: AttemptId,
  evidence: RefutingEvidence,
});
const Cancelled = Schema.TaggedStruct("Cancelled", {
  id: AttemptId,
  by: Schema.Literals(["attempt-owner", "person"]),
  reason: Schema.String,
});

export const Attempt = Schema.Union([
  Intended,
  Uncertain,
  Confirmed,
  Refuted,
  Cancelled,
]);
export type Attempt = typeof Attempt.Type;
export type Confirmed = typeof Confirmed.Type;

type AttemptTag = Attempt["_tag"];

export type AttemptEvent =
  | { readonly _tag: "EffectStarted" }
  | { readonly _tag: "Confirm"; readonly evidence: PositiveEvidence }
  | { readonly _tag: "Refute"; readonly evidence: RefutingEvidence }
  | {
      readonly _tag: "Cancel";
      readonly by: (typeof Cancelled.Type)["by"];
      readonly reason: string;
    };

type AttemptEventTag = AttemptEvent["_tag"];

interface StateAfter {
  readonly EffectStarted: "Uncertain";
  readonly Confirm: "Confirmed";
  readonly Refute: "Refuted";
  readonly Cancel: "Cancelled";
}

export interface AttemptRefusal {
  readonly _tag:
    | "EffectNotStarted"
    | "UncertainNeverRetried"
    | "UncertainNeverCancelled"
    | "AttemptResolved"
    | "EvidenceForAnotherAttempt";
  readonly state: Attempt["_tag"];
  readonly event: AttemptEvent["_tag"];
}

type TableRefusal = Exclude<
  AttemptRefusal["_tag"],
  "EvidenceForAnotherAttempt"
>;

type Cell<Event extends AttemptEventTag> =
  | { readonly to: StateAfter[Event]; readonly refusal?: never }
  | { readonly refusal: TableRefusal; readonly to?: never };

const resolved = {
  EffectStarted: { refusal: "AttemptResolved" },
  Confirm: { refusal: "AttemptResolved" },
  Refute: { refusal: "AttemptResolved" },
  Cancel: { refusal: "AttemptResolved" },
} as const;

const transitions: {
  readonly [State in AttemptTag]: {
    readonly [Event in AttemptEventTag]: Cell<Event>;
  };
} = {
  Intended: {
    EffectStarted: { to: "Uncertain" },
    Confirm: { refusal: "EffectNotStarted" },
    Refute: { refusal: "EffectNotStarted" },
    Cancel: { to: "Cancelled" },
  },
  Uncertain: {
    EffectStarted: { refusal: "UncertainNeverRetried" },
    Confirm: { to: "Confirmed" },
    Refute: { to: "Refuted" },
    Cancel: { refusal: "UncertainNeverCancelled" },
  },
  Confirmed: resolved,
  Refuted: resolved,
  Cancelled: resolved,
};

export const attemptTransitions: Readonly<
  Record<
    Attempt["_tag"],
    Readonly<
      Record<
        AttemptEvent["_tag"],
        {
          readonly to?: Attempt["_tag"];
          readonly refusal?: AttemptRefusal["_tag"];
        }
      >
    >
  >
> = transitions;

function evidenceIsForAnotherAttempt(
  id: AttemptId,
  event: AttemptEvent,
): boolean {
  return (
    (event._tag === "Confirm" || event._tag === "Refute") &&
    event.evidence.attemptId !== id
  );
}

function stateAfter(id: AttemptId, event: AttemptEvent): Attempt {
  switch (event._tag) {
    case "EffectStarted":
      return { _tag: "Uncertain", id };
    case "Confirm":
      return { _tag: "Confirmed", id, evidence: event.evidence };
    case "Refute":
      return { _tag: "Refuted", id, evidence: event.evidence };
    case "Cancel":
      return { _tag: "Cancelled", id, by: event.by, reason: event.reason };
  }
}

export function transitionAttempt(
  attempt: Attempt,
  event: AttemptEvent,
): Result.Result<Attempt, AttemptRefusal> {
  const refusal =
    attemptTransitions[attempt._tag][event._tag].refusal ??
    (evidenceIsForAnotherAttempt(attempt.id, event)
      ? "EvidenceForAnotherAttempt"
      : undefined);
  return refusal === undefined
    ? Result.succeed(stateAfter(attempt.id, event))
    : Result.fail({ _tag: refusal, state: attempt._tag, event: event._tag });
}
