import type { OperationResult } from "../commands-contract.ts";

export function status(
  commandIdentity: string,
  data: unknown,
  message: string,
): OperationResult {
  return {
    commandIdentity,
    data,
    message,
    causeCode: "SUCCESS_UNCHANGED",
    effectClass: "inspect",
    effects: {
      completed: [],
      remaining: [],
      uncertain: [],
      inventoryComplete: true,
    },
    exitCode: 0,
    failureClass: null,
    nextAction: "No follow-up is required.",
    outcome: "success",
    repairAction: null,
    retryable: false,
    transactionState: "unchanged",
  };
}
