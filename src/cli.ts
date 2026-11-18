import { randomUUID } from "node:crypto";
import { commands } from "./commands.ts";
import {
  builtInCommandSummaries,
  builtInStations,
  commandSummaries,
  type CommandDefinition,
  type OperationResult,
} from "./commands-contract.ts";

const CONTRACT_VERSION = "2.0.0";
const COMMANDS = [...builtInCommandSummaries(), ...commandSummaries(commands)];
const AVAILABLE_PATHS = [
  ...COMMANDS.map((command) => command.commandIdentity),
].sort();

function effects() {
  return {
    completed: [],
    inventoryComplete: true,
    remaining: [],
    uncertain: [],
  };
}

function success(commandIdentity: string, data: unknown, message: string) {
  return {
    availablePaths: AVAILABLE_PATHS,
    contractVersion: CONTRACT_VERSION,
    envelopeVersion: 2,
    message,
    result: {
      causeCode: "SUCCESS_UNCHANGED",
      commandIdentity,
      data,
      effectClass: "inspect",
      effects: effects(),
      exitCode: 0,
      failureClass: null,
      nextAction: "No follow-up is required.",
      outcome: "success",
      repairAction: null,
      retryable: false,
      runId: randomUUID(),
      transactionState: "unchanged",
    },
  };
}

function refusal(message: string) {
  return {
    availablePaths: AVAILABLE_PATHS,
    contractVersion: CONTRACT_VERSION,
    envelopeVersion: 2,
    message,
    result: {
      causeCode: "USAGE_INVALID_INVOCATION",
      commandIdentity: "example.dispatch",
      data: null,
      effectClass: "inspect",
      effects: effects(),
      exitCode: 2,
      failureClass: "usage",
      nextAction: "Run example --help and choose a listed command.",
      outcome: "refused",
      repairAction: "Choose one supported command and retry.",
      retryable: false,
      runId: randomUUID(),
      transactionState: "unchanged",
    },
  };
}

type InternalFailureStationBase = {
  commandIdentity: string;
  effectClass: "inspect";
  exitCode: 1;
  failureClass: "internal";
  nextAction: string;
  outcome: "failed";
  retryable: false;
  transactionState: "unchanged";
};

type SerializationFailureStation = InternalFailureStationBase & {
  causeCode: "INTERNAL_RESULT_UNCHANGED";
  message: "The machine result could not be serialized.";
  repairAction: "Inspect the serialization failure before retrying.";
  trigger: "The machine status result cannot be serialized.";
};

type OutputEmissionFailureStation = InternalFailureStationBase & {
  causeCode: "INTERNAL_RESULT_UNCHANGED";
  message: "The status output could not be emitted.";
  nextAction: "Inspect the status output and retry example status.";
  repairAction: "Inspect the status output stream before retrying.";
  trigger: "The status output cannot be emitted.";
};

type InternalFailureStation =
  | SerializationFailureStation
  | OutputEmissionFailureStation
  | UnexpectedCommandFailureStation;

type UnexpectedCommandFailureStation = InternalFailureStationBase & {
  causeCode: "INTERNAL_RESULT_UNCHANGED";
  message: "The command could not be completed.";
  repairAction: "Check the selected domain configuration and implementation before retrying.";
  trigger: "The selected read-only domain cannot load or complete.";
};
const COMMAND_FAILURE_STATION: UnexpectedCommandFailureStation = {
  commandIdentity: "example.status",
  effectClass: "inspect",
  exitCode: 1,
  failureClass: "internal",
  causeCode: "INTERNAL_RESULT_UNCHANGED",
  message: "The command could not be completed.",
  nextAction: "Repair the selected domain or choose an unrelated command.",
  outcome: "failed",
  repairAction:
    "Check the selected domain configuration and implementation before retrying.",
  retryable: false,
  transactionState: "unchanged",
  trigger: "The selected read-only domain cannot load or complete.",
};

const SERIALIZATION_FAILURE_STATION: SerializationFailureStation = {
  commandIdentity: "example.status",
  effectClass: "inspect",
  exitCode: 1,
  failureClass: "internal",
  causeCode: "INTERNAL_RESULT_UNCHANGED",
  message: "The machine result could not be serialized.",
  nextAction: "Inspect the runtime and retry example status.",
  outcome: "failed",
  repairAction: "Inspect the serialization failure before retrying.",
  retryable: false,
  transactionState: "unchanged",
  trigger: "The machine status result cannot be serialized.",
};

const OUTPUT_EMISSION_FAILURE_STATION: OutputEmissionFailureStation = {
  commandIdentity: "example.status",
  effectClass: "inspect",
  exitCode: 1,
  failureClass: "internal",
  causeCode: "INTERNAL_RESULT_UNCHANGED",
  message: "The status output could not be emitted.",
  nextAction: "Inspect the status output and retry example status.",
  outcome: "failed",
  repairAction: "Inspect the status output stream before retrying.",
  retryable: false,
  transactionState: "unchanged",
  trigger: "The status output cannot be emitted.",
};

function internalFailure(station: InternalFailureStation) {
  return {
    availablePaths: AVAILABLE_PATHS,
    contractVersion: CONTRACT_VERSION,
    envelopeVersion: 2,
    message: station.message,
    result: {
      causeCode: station.causeCode,
      commandIdentity: station.commandIdentity,
      data: null,
      effectClass: station.effectClass,
      effects: effects(),
      exitCode: station.exitCode,
      failureClass: station.failureClass,
      handoff: {
        owner: "operator",
        reason: "The read-only command could not produce its result.",
        inspect: [
          "Inspect the command implementation and output transport before another run.",
        ],
      },
      outcome: station.outcome,
      repairAction:
        "Repair the command or output transport before another run.",
      retryable: station.retryable,
      runId: randomUUID(),
      transactionState: station.transactionState,
    },
  };
}

function discoveryData() {
  return {
    commands: COMMANDS,
    contractVersion: CONTRACT_VERSION,
    effectExclusions: [
      "The simple starter never changes user data or configuration.",
    ],
    exitMeanings: {
      "0": "success",
      "1": "internal",
      "2": "usage",
      "3": "domain",
      "4": "schema",
      "75": "transient",
    },
    generationConventionVersion: CONTRACT_VERSION,
    profile: "simple",
    signalExits: { "130": "SIGINT", "143": "SIGTERM" },
  };
}

function commandDiscovery(
  command: ReturnType<typeof commandSummaries>[number],
) {
  const builtIns = builtInStations(command.commandIdentity);
  if (builtIns.length > 0)
    return { command, semantics: "possible-outcomes", stations: builtIns };
  return {
    command,
    semantics: "possible-outcomes",
    stations: [
      failureDiscoveryStation({
        ...COMMAND_FAILURE_STATION,
        commandIdentity: command.commandIdentity,
      }),
      {
        causeCode: "SUCCESS_UNCHANGED",
        commandIdentity: command.commandIdentity,
        effectClass: "inspect",
        exitCode: 0,
        failureClass: null,
        guidance: { nextAction: "No follow-up is required." },
        outcome: "success",
        reachability: "required",
        repairAction: null,
        retryable: false,
        retryDelayPolicy: { kind: "none" },
        transactionState: "unchanged",
        trigger: "The status inspection completes.",
        unreachableRationale: null,
      },
    ],
  };
}

function failureDiscoveryStation(station: InternalFailureStation) {
  return {
    causeCode: station.causeCode,
    commandIdentity: station.commandIdentity,
    effectClass: station.effectClass,
    exitCode: station.exitCode,
    failureClass: station.failureClass,
    guidance: {
      handoff: {
        owner: "operator",
        reason: "The read-only command could not produce its result.",
        inspect: [
          "Inspect the command implementation and output transport before another run.",
        ],
      },
    },
    outcome: station.outcome,
    reachability: "required",
    repairAction: "Repair the command or output transport before another run.",
    retryable: station.retryable,
    retryDelayPolicy: { kind: "none" },
    transactionState: station.transactionState,
    trigger: station.trigger,
    unreachableRationale: null,
  };
}

function hasJson(argv: string[]): boolean {
  const separator = argv.indexOf("--");
  const options = separator === -1 ? argv : argv.slice(0, separator);
  return options.includes("--json");
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function emit(value: string): void {
  process.stdout.write(value);
}

function render(value: unknown, json: boolean, human: string): void {
  emit(json ? serialize(value) : `${human}\n`);
}

let internalFailureReported = false;

function reportInternalFailureToStderr(
  failure: ReturnType<typeof internalFailure>,
): void {
  if (internalFailureReported) return;
  internalFailureReported = true;
  process.stderr.write(
    `${failure.message} Repair: ${failure.result.repairAction}\n`,
  );
}

function reportInternalFailure(
  station: InternalFailureStation,
  json: boolean,
): number {
  const failure = internalFailure(station);
  if (json) {
    try {
      render(failure, true, failure.message);
    } catch {
      return 1;
    }
  } else {
    reportInternalFailureToStderr(failure);
  }
  return 1;
}

let asynchronousStdoutFailure = false;
let activeCommandIdentity = "example.dispatch";

function reportAsynchronousStdoutFailure(
  error: Error & { code?: string },
): void {
  asynchronousStdoutFailure = true;
  process.exitCode = 1;
  if (error.code === "EPIPE" || hasJson(process.argv.slice(2))) return;
  reportInternalFailureToStderr(
    internalFailure({
      ...OUTPUT_EMISSION_FAILURE_STATION,
      commandIdentity: activeCommandIdentity,
    }),
  );
}

function showHelp(json: boolean): number {
  activeCommandIdentity = "example.help";
  render(
    success(
      "example.help",
      {
        commands: COMMANDS,
        options: [
          {
            name: "--json",
            summary: "Emit one Contract Core envelope.",
            valueName: null,
          },
        ],
        summary: "Read-only example CLI.",
        usage: "example COMMAND [--json]",
      },
      "Show help.",
    ),
    json,
    `Usage: example COMMAND [--json]\n${commands.map((command) => command.route.join(" ")).join("\n")}`,
  );
  return 0;
}

function showDiscovery(json: boolean): number {
  activeCommandIdentity = "example.discovery";
  render(
    success("example.discovery", discoveryData(), "Describe commands."),
    json,
    `Commands: ${COMMANDS.map((command) => command.route.join(" ")).join(", ")}`,
  );
  return 0;
}

function showInspection(
  option: string | undefined,
  json: boolean,
): number | undefined {
  switch (option) {
    case "--help":
    case "-h":
      return showHelp(json);
    case "--discover":
      return showDiscovery(json);
    default:
      return undefined;
  }
}

function showCommand(
  identity: string | undefined,
  json: boolean,
): number | undefined {
  const command = COMMANDS.find(
    (candidate) => candidate.commandIdentity === identity,
  );
  if (command === undefined) return undefined;
  activeCommandIdentity = "example.command-discovery";
  render(
    success(
      "example.command-discovery",
      commandDiscovery(command),
      `Describe ${command.commandIdentity}.`,
    ),
    json,
    `${command.commandIdentity}: success/unchanged`,
  );
  return 0;
}

function runInspection(args: string[], json: boolean): number | undefined {
  if (args.length === 1) return showInspection(args[0], json);
  if (args.length === 2 && args[0] === "--discover-command")
    return showCommand(args[1], json);
  return undefined;
}

function nonemptyGuidance(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGuidanceRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function guidanceRecord(
  value: unknown,
  required: string[],
  optional: string[] = [],
): value is Record<string, unknown> {
  if (!isGuidanceRecord(value)) return false;
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}

function validGuidanceResource(value: unknown): boolean {
  return (
    guidanceRecord(value, ["kind", "id"]) &&
    nonemptyGuidance(value.kind) &&
    nonemptyGuidance(value.id)
  );
}

function validInspection(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.from(value).every(nonemptyGuidance)
  );
}

function validHandoffDetails(value: Record<string, unknown>): boolean {
  return (
    ["human", "operator"].some((owner) => value.owner === owner) &&
    nonemptyGuidance(value.reason) &&
    validInspection(value.inspect)
  );
}

function validHandoff(value: unknown): boolean {
  if (!guidanceRecord(value, ["owner", "reason", "inspect"], ["resource"]))
    return false;
  return (
    validHandoffDetails(value) &&
    (!Object.hasOwn(value, "resource") || validGuidanceResource(value.resource))
  );
}

function validateGuidance(
  guidance: Pick<OperationResult, "nextAction" | "handoff">,
): void {
  if (
    Object.hasOwn(guidance, "nextAction") ===
      Object.hasOwn(guidance, "handoff") ||
    !(Object.hasOwn(guidance, "nextAction")
      ? nonemptyGuidance(guidance.nextAction)
      : validHandoff(guidance.handoff))
  )
    throw new Error(
      "Command results require exactly one valid guidance branch.",
    );
}

function formatOperation(
  result: { result: Omit<OperationResult, "message"> & { runId: string } },
  message: string,
  json: boolean,
): string {
  validateGuidance(result.result);
  return json ? serialize(result) : `${message}\n`;
}

async function runSelectedCommand(
  selected: CommandDefinition,
  json: boolean,
): Promise<number> {
  activeCommandIdentity = selected.commandIdentity;
  let operation;
  try {
    operation = await selected.execute([]);
  } catch {
    return reportInternalFailure(
      { ...COMMAND_FAILURE_STATION, commandIdentity: selected.commandIdentity },
      json,
    );
  }
  const { message, ...facts } = operation;
  const result = {
    availablePaths: AVAILABLE_PATHS,
    contractVersion: CONTRACT_VERSION,
    envelopeVersion: 2,
    message,
    result: { ...facts, runId: randomUUID() },
  };
  let output: string;
  try {
    output = formatOperation(result, message, json);
  } catch {
    return reportInternalFailure(
      {
        ...SERIALIZATION_FAILURE_STATION,
        commandIdentity: selected.commandIdentity,
      },
      json,
    );
  }
  try {
    emit(output);
  } catch {
    return reportInternalFailure(
      {
        ...OUTPUT_EMISSION_FAILURE_STATION,
        commandIdentity: selected.commandIdentity,
      },
      json,
    );
  }
  return operation.exitCode;
}

function reportUsage(json: boolean): number {
  const failure = refusal("Choose a supported command.");
  if (json) process.stdout.write(`${JSON.stringify(failure)}\n`);
  else
    process.stderr.write("Choose a supported command. Run example --help.\n");
  return 2;
}

async function main(argv: string[]): Promise<number> {
  process.stdout.on("error", reportAsynchronousStdoutFailure);
  const json = hasJson(argv);
  const separator = argv.indexOf("--");
  const args = argv.filter(
    (value, index) =>
      value !== "--json" || (separator >= 0 && index > separator),
  );
  const inspection = runInspection(args, json);
  if (inspection !== undefined) return inspection;
  const selected = commands.find(
    (command) =>
      command.route.length === args.length &&
      command.route.every((token, index) => token === args[index]),
  );
  if (selected !== undefined) return await runSelectedCommand(selected, json);
  return reportUsage(json);
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = asynchronousStdoutFailure ? 1 : exitCode;
