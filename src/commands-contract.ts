export type EffectClass = "inspect" | "repository-local";
export type Outcome = "failed" | "refused" | "success";
export type TransactionState = "completed" | "unchanged" | "unknown";

export interface OperationResult {
  causeCode: string;
  commandIdentity: string;
  data: unknown;
  effectClass: EffectClass;
  effects: {
    completed: string[];
    inventoryComplete: boolean;
    remaining: string[];
    uncertain: string[];
  };
  exitCode: 0 | 1 | 2 | 3 | 4;
  failureClass: "domain" | "internal" | "schema" | "usage" | null;
  handoff?: { owner: "human" | "operator"; reason: string; inspect: string[] };
  message: string;
  nextAction?: string;
  outcome: Outcome;
  repairAction: string | null;
  retryable: false;
  transactionState: TransactionState;
}

export interface CommandDefinition {
  commandIdentity: string;
  effectClass: EffectClass;
  route: readonly string[];
  summary: string;
  execute(args: string[]): Promise<OperationResult>;
  stations(): readonly unknown[];
}

export function commandSummaries(commands: readonly CommandDefinition[]) {
  return commands.map(({ commandIdentity, effectClass, route, summary }) => ({
    commandIdentity,
    effectClass,
    route,
    summary,
  }));
}

export function builtInCommandSummaries() {
  return [
    {
      commandIdentity: "example.dispatch",
      effectClass: "inspect" as const,
      route: [],
      summary: "Validate the invocation.",
    },
    {
      commandIdentity: "example.help",
      effectClass: "inspect" as const,
      route: ["--help"],
      summary: "Show help.",
    },
    {
      commandIdentity: "example.discovery",
      effectClass: "inspect" as const,
      route: ["--discover"],
      summary: "Describe commands.",
    },
    {
      commandIdentity: "example.command-discovery",
      effectClass: "inspect" as const,
      route: ["--discover-command"],
      summary: "Describe one command's possible outcomes.",
    },
  ];
}

export function builtInStations(commandIdentity: string) {
  if (
    !builtInCommandSummaries().some(
      (item) => item.commandIdentity === commandIdentity,
    )
  )
    return [];
  const outcome =
    commandIdentity === "example.dispatch"
      ? {
          causeCode: "USAGE_INVALID_INVOCATION",
          outcome: "refused",
          failureClass: "usage",
          exitCode: 2,
          guidance: {
            nextAction: "Run example --help and choose a listed command.",
          },
          repairAction: "Choose one supported command and retry.",
          trigger: "The invocation does not select a supported command.",
        }
      : {
          causeCode: "SUCCESS_UNCHANGED",
          outcome: "success",
          failureClass: null,
          exitCode: 0,
          guidance: { nextAction: "No follow-up is required." },
          repairAction: null,
          trigger: "The requested help or discovery is produced.",
        };
  return [
    {
      commandIdentity,
      ...outcome,
      effectClass: "inspect",
      transactionState: "unchanged",
      retryable: false,
      retryDelayPolicy: { kind: "none" },
      reachability: "required",
      unreachableRationale: null,
    },
  ];
}
