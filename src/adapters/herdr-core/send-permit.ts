import { Context, Layer, Result } from "effect";
import type { Attempt, AttemptId } from "../../domains/attempt/index.ts";

type Uncertain = Extract<Attempt, { readonly _tag: "Uncertain" }>;

export type SendPermitRefusal =
  | "not made by the send permit maker"
  | "a terminal start for this attempt id was already made";

type AttemptsStarted = Set<AttemptId>;

const startedByMaker = new WeakMap<SendPermit, AttemptsStarted>();
let issue: (attemptId: AttemptId, started: AttemptsStarted) => SendPermit;

export class SendPermit {
  readonly #attemptId: AttemptId;

  private constructor(attemptId: AttemptId) {
    this.#attemptId = attemptId;
  }

  get attemptId(): AttemptId {
    return this.#attemptId;
  }

  static {
    issue = (attemptId, started) => {
      const permit = new SendPermit(attemptId);
      startedByMaker.set(permit, started);
      return permit;
    };
  }
}

export function spendSendPermit(
  permit: SendPermit,
): Result.Result<AttemptId, SendPermitRefusal> {
  const started = startedByMaker.get(permit);
  if (started === undefined)
    return Result.fail("not made by the send permit maker");
  if (started.has(permit.attemptId))
    return Result.fail("a terminal start for this attempt id was already made");
  started.add(permit.attemptId);
  return Result.succeed(permit.attemptId);
}

export class SendPermitMaker extends Context.Service<
  SendPermitMaker,
  { readonly make: (uncertain: Uncertain) => SendPermit }
>()("SendPermitMaker") {
  static readonly layer = Layer.sync(SendPermitMaker, () => {
    const started: AttemptsStarted = new Set();
    return { make: (uncertain) => issue(uncertain.id, started) };
  });
}
