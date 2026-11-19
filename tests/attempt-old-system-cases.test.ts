import { expect, test } from "bun:test";
import type { Attempt } from "../src/domains/attempt/index.ts";
import {
  anotherAttemptId,
  attemptId,
  eventsWithoutEvidence,
  intended,
  refusalOf,
  stateAfter,
  terminalFor,
  uncertain,
} from "./attempt-fixtures.ts";

const SOURCE = "test/test_launch_admission.py";

const attemptStateFor = {
  "never-submitted": "Intended",
  "submission-uncertain": "Uncertain",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
} as const;

function expectJournalState(
  attempt: Attempt,
  journalState: keyof typeof attemptStateFor,
) {
  expect(attempt._tag).toBe(attemptStateFor[journalState]);
  expect(attempt.id).toBe(attemptId);
}

const recover = {
  _tag: "Cancel",
  by: "person",
  reason: "released by launch recover: never sent",
} as const;

test(`${SOURCE} TaskStarts.test_a_start_is_claimed_sent_and_confirmed_under_one_launch_id`, () => {
  expectJournalState(intended, "never-submitted");
  expectJournalState(uncertain, "submission-uncertain");
  const confirmed = stateAfter(uncertain, {
    _tag: "Confirm",
    evidence: terminalFor(attemptId, "t1"),
  });
  expectJournalState(confirmed, "confirmed");
  expect(confirmed).toMatchObject({ evidence: { result: "t1" } });
});

test(`${SOURCE} TaskStarts.test_competing_start_after_a_crash_before_dispatch_waits_for_recover`, () => {
  expectJournalState(intended, "never-submitted");
  const recovered = stateAfter(intended, recover);
  expectJournalState(recovered, "cancelled");
  expect(recovered).toMatchObject({ by: "person" });
});

test(`${SOURCE} TaskStarts.test_a_delayed_sender_is_fenced_after_recovery`, () => {
  const recovered = stateAfter(intended, recover);
  expect(refusalOf(recovered, { _tag: "EffectStarted" })).toBe(
    "AttemptResolved",
  );
  expectJournalState(recovered, "cancelled");
});

test(`${SOURCE} TaskStarts.test_shutdown_before_dispatch_cancels_its_own_claim`, () => {
  const stopped = stateAfter(intended, {
    _tag: "Cancel",
    by: "attempt-owner",
    reason: "stopped before it was sent (SystemExit)",
  });
  expectJournalState(stopped, "cancelled");
  expect(stopped).toMatchObject({
    by: "attempt-owner",
    reason: "stopped before it was sent (SystemExit)",
  });
});

test(`${SOURCE} TaskStarts.test_a_crash_after_dispatch_stays_uncertain_until_its_terminal_is_found`, () => {
  expectJournalState(uncertain, "submission-uncertain");
  expect(refusalOf(uncertain, recover)).toBe("UncertainNeverCancelled");
  expect(refusalOf(uncertain, { _tag: "EffectStarted" })).toBe(
    "UncertainNeverRetried",
  );
  expectJournalState(
    stateAfter(uncertain, {
      _tag: "Confirm",
      evidence: terminalFor(attemptId),
    }),
    "confirmed",
  );
});

test(`${SOURCE} TaskStarts.test_a_lost_reply_is_confirmed_by_its_own_launch_label`, () => {
  const reconciled = stateAfter(uncertain, {
    _tag: "Confirm",
    evidence: terminalFor(attemptId, "t7"),
  });
  expectJournalState(reconciled, "confirmed");
  expect(reconciled).toMatchObject({
    evidence: { attemptId, result: "t7" },
  });
});

test(`${SOURCE} TaskStarts.test_an_unconfirmed_reply_keeps_its_launch_id_and_is_never_retried`, () => {
  expect(
    eventsWithoutEvidence.map((event) => refusalOf(uncertain, event)),
  ).toEqual([
    "UncertainNeverRetried",
    "UncertainNeverCancelled",
    "UncertainNeverCancelled",
  ]);
  expect(
    refusalOf(uncertain, {
      _tag: "Confirm",
      evidence: terminalFor(anotherAttemptId, "t50"),
    }),
  ).toBe("EvidenceForAnotherAttempt");
  const late = stateAfter(uncertain, {
    _tag: "Confirm",
    evidence: terminalFor(attemptId, "t50"),
  });
  expectJournalState(late, "confirmed");
  expect(late).toMatchObject({ evidence: { result: "t50" } });
});

test(`${SOURCE} TaskStarts.test_settings_changed_before_submission_cancel_the_claim`, () => {
  const changed = stateAfter(intended, {
    _tag: "Cancel",
    by: "attempt-owner",
    reason: "settings changed before it was sent",
  });
  expectJournalState(changed, "cancelled");
  expect(refusalOf(changed, { _tag: "EffectStarted" })).toBe("AttemptResolved");
});

test(`${SOURCE} OwnerWords.test_a_second_recover_says_nothing_was_released_and_reconcile_points_at_recover`, () => {
  expect(
    refusalOf(intended, { _tag: "Confirm", evidence: terminalFor(attemptId) }),
  ).toBe("EffectNotStarted");
  const recovered = stateAfter(intended, recover);
  expectJournalState(recovered, "cancelled");
  expect(refusalOf(recovered, recover)).toBe("AttemptResolved");
});
