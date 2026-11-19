import { Result } from "effect";
import {
  type Attempt,
  type AttemptEvent,
  AttemptId,
  type AttemptRefusal,
  type PositiveEvidence,
  type RefutingEvidence,
  transitionAttempt,
} from "../src/domains/attempt/index.ts";

export const attemptId = AttemptId.make("6f1d2c3a-0b4e-4c5d-8e6f-7a8b9c0d1e2f");
export const anotherAttemptId = AttemptId.make(
  "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d",
);

export function terminalFor(id: AttemptId, result = "t50"): PositiveEvidence {
  return { _tag: "PositiveEvidence", attemptId: id, result };
}

export function nothingReachedFor(id: AttemptId): RefutingEvidence {
  return {
    _tag: "RefutingEvidence",
    attemptId: id,
    reason: "hc could not be started",
  };
}

export const intended: Attempt = { _tag: "Intended", id: attemptId };

export function stateAfter(attempt: Attempt, event: AttemptEvent): Attempt {
  const result = transitionAttempt(attempt, event);
  if (Result.isFailure(result))
    throw new Error(
      `${attempt._tag} refused ${event._tag}: ${result.failure._tag}`,
    );
  return result.success;
}

export function refusalOf(
  attempt: Attempt,
  event: AttemptEvent,
): AttemptRefusal["_tag"] | "no refusal" {
  const result = transitionAttempt(attempt, event);
  return Result.isFailure(result) ? result.failure._tag : "no refusal";
}

export const uncertain = stateAfter(intended, { _tag: "EffectStarted" });

export const eventsWithoutEvidence: readonly AttemptEvent[] = [
  { _tag: "EffectStarted" },
  { _tag: "Cancel", by: "attempt-owner", reason: "its run gave up" },
  { _tag: "Cancel", by: "person", reason: "launch recover" },
];
