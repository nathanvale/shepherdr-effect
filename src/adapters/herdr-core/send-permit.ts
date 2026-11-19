import { Context, Layer } from "effect";
import type { Attempt, AttemptId } from "../../domains/attempt/index.ts";

type Uncertain = Extract<Attempt, { readonly _tag: "Uncertain" }>;

const unspent = new WeakSet<SendPermit>();
let issue: (attemptId: AttemptId) => SendPermit;

export class SendPermit {
  readonly #attemptId: AttemptId;

  private constructor(attemptId: AttemptId) {
    this.#attemptId = attemptId;
  }

  get attemptId(): AttemptId {
    return this.#attemptId;
  }

  static {
    issue = (attemptId) => {
      const permit = new SendPermit(attemptId);
      unspent.add(permit);
      return permit;
    };
  }
}

export function spendSendPermit(permit: SendPermit): AttemptId | undefined {
  return unspent.delete(permit) ? permit.attemptId : undefined;
}

export class SendPermitMaker extends Context.Service<
  SendPermitMaker,
  { readonly make: (uncertain: Uncertain) => SendPermit }
>()("SendPermitMaker") {
  static readonly layer = Layer.succeed(SendPermitMaker, {
    make: (uncertain) => issue(uncertain.id),
  });
}
