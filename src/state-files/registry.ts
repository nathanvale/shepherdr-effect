import type { Schema } from "effect";
import {
  AutopilotFile,
  FeedbackFile,
  HeldFile,
  MachinesFile,
  NewslogFile,
  NewsFile,
  ReachFile,
  RetriesFile,
  SchedulerFile,
  SeenFile,
  SettingsPassFile,
  StopsLine,
} from "./engine-state.ts";
import { HerdrCoreDocsFile, HerdrCoreTerminalsFile } from "./herdr-core.ts";
import { LaunchesFile, PublicationsFile } from "./attempts.ts";
import {
  CliCheckFile,
  CodexSandboxFile,
  LayoutFile,
  MigrateFile,
} from "./machine-state.ts";
import { SentFile, ServiceFile, UsageLine, WebFile } from "./service-state.ts";
import { ModelPicksFile, SettingsFile } from "./settings.ts";
import { TaskListFile } from "./task-list.ts";

export type Writer =
  | "herdr-task"
  | "service"
  | "window"
  | "installer"
  | "herdr-core";

export type LockPath = string;

export type WriteDiscipline =
  | { readonly write: "never" }
  | {
      readonly write: "rename" | "in-place" | "append";
      readonly lock: LockPath | null;
      readonly fsync: boolean;
    };

export type Family =
  | "task-lists"
  | "attempts"
  | "engine-state"
  | "settings"
  | "service-state"
  | "machine-state"
  | "herdr-core";

export type SlashPathFromStateRoot = string;
export type StatePathPattern = RegExp;
export type JsonLinesFormat = "json-lines";

export interface StateFileEntry {
  readonly family: Family;
  readonly file: SlashPathFromStateRoot | StatePathPattern;
  readonly format: "json" | JsonLinesFormat;
  readonly schema: Schema.Codec<unknown, unknown>;
  readonly writers: readonly Writer[];
  readonly discipline: WriteDiscipline;
}

const CONFIG = ".config/shepherdr";
const DATA = ".local/share/shepherdr";
const TASKS = `${DATA}/tasks`;
const STATE = ".local/state/shepherdr";
const SERVICE = `${STATE}/service`;
const HERDR_CORE = ".local/state/herdr-core/default";

const renamed = (lock: string | null = null): WriteDiscipline => ({
  write: "rename",
  lock,
  fsync: false,
});
const synced = (lock: string): WriteDiscipline => ({
  write: "rename",
  lock,
  fsync: true,
});
const inPlace = (lock: string | null = null): WriteDiscipline => ({
  write: "in-place",
  lock,
  fsync: false,
});
const renamedUnderTickLock = renamed(".tick.lock");

export const stateFiles: readonly StateFileEntry[] = [
  {
    family: "attempts",
    file: `${TASKS}/.launches.json`,
    format: "json",
    schema: LaunchesFile,
    writers: ["herdr-task"],
    discipline: synced(".launches.lock"),
  },
  {
    family: "attempts",
    file: `${TASKS}/.publications.json`,
    format: "json",
    schema: PublicationsFile,
    writers: ["herdr-task"],
    discipline: synced(".publications.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.machines.json`,
    format: "json",
    schema: MachinesFile,
    writers: ["herdr-task"],
    discipline: renamed(".machines.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.reach.json`,
    format: "json",
    schema: ReachFile,
    writers: ["herdr-task"],
    discipline: renamed(".reach.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.scheduler.json`,
    format: "json",
    schema: SchedulerFile,
    writers: ["herdr-task"],
    discipline: inPlace(".scheduler.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.seen.json`,
    format: "json",
    schema: SeenFile,
    writers: ["herdr-task"],
    discipline: renamedUnderTickLock,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.retries.json`,
    format: "json",
    schema: RetriesFile,
    writers: ["herdr-task"],
    discipline: renamedUnderTickLock,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.news.json`,
    format: "json",
    schema: NewsFile,
    writers: ["herdr-task"],
    discipline: renamedUnderTickLock,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.newslog.json`,
    format: "json",
    schema: NewslogFile,
    writers: ["herdr-task"],
    discipline: renamedUnderTickLock,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.held.json`,
    format: "json",
    schema: HeldFile,
    writers: ["herdr-task"],
    discipline: renamed(".held.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.autopilot.json`,
    format: "json",
    schema: AutopilotFile,
    writers: ["herdr-task"],
    discipline: renamed(".autopilot.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.feedback.json`,
    format: "json",
    schema: FeedbackFile,
    writers: ["herdr-task"],
    discipline: renamed(".feedback.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.reactions.json`,
    format: "json",
    schema: SettingsPassFile,
    writers: ["herdr-task"],
    discipline: renamedUnderTickLock,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.assistant-settings.json`,
    format: "json",
    schema: SettingsPassFile,
    writers: ["herdr-task"],
    discipline: renamedUnderTickLock,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.stops.jsonl`,
    format: "json-lines",
    schema: StopsLine,
    writers: ["herdr-task"],
    discipline: renamed(),
  },
  {
    family: "task-lists",
    file: /^\.local\/share\/shepherdr\/tasks\/[^/]+\.json$/,
    format: "json",
    schema: TaskListFile,
    writers: ["herdr-task"],
    discipline: renamed(".<slug>.json.lock"),
  },
  {
    family: "settings",
    file: `${CONFIG}/settings.json`,
    format: "json",
    schema: SettingsFile,
    writers: ["window", "service", "herdr-task"],
    discipline: renamed(),
  },
  {
    family: "settings",
    file: `${CONFIG}/model-picks.json`,
    format: "json",
    schema: ModelPicksFile,
    writers: ["window", "service"],
    discipline: inPlace(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/service.json`,
    format: "json",
    schema: ServiceFile,
    writers: ["service"],
    discipline: inPlace(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/web.json`,
    format: "json",
    schema: WebFile,
    writers: ["service"],
    discipline: inPlace(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/sent.json`,
    format: "json",
    schema: SentFile,
    writers: ["service"],
    discipline: renamed(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/usage.jsonl`,
    format: "json-lines",
    schema: UsageLine,
    writers: ["service", "window"],
    discipline: { write: "append", lock: null, fsync: false },
  },
  {
    family: "machine-state",
    file: `${STATE}/cli-check.json`,
    format: "json",
    schema: CliCheckFile,
    writers: ["herdr-task"],
    discipline: renamed(),
  },
  {
    family: "machine-state",
    file: `${STATE}/codex-sandbox.json`,
    format: "json",
    schema: CodexSandboxFile,
    writers: ["herdr-task"],
    discipline: renamed(),
  },
  {
    family: "machine-state",
    file: `${STATE}/migrate.json`,
    format: "json",
    schema: MigrateFile,
    writers: ["herdr-task", "installer"],
    discipline: synced("migrate.lock"),
  },
  {
    family: "machine-state",
    file: `${DATA}/LAYOUT`,
    format: "json",
    schema: LayoutFile,
    writers: ["herdr-task", "installer"],
    discipline: synced("../../state/shepherdr/migrate.lock"),
  },
  {
    family: "herdr-core",
    file: `${HERDR_CORE}/docs.json`,
    format: "json",
    schema: HerdrCoreDocsFile,
    writers: ["herdr-core"],
    discipline: { write: "never" },
  },
  {
    family: "herdr-core",
    file: `${HERDR_CORE}/terminals.json`,
    format: "json",
    schema: HerdrCoreTerminalsFile,
    writers: ["herdr-core"],
    discipline: { write: "never" },
  },
];

export function findStateFile(
  path: SlashPathFromStateRoot,
): StateFileEntry | undefined {
  return stateFiles.find(({ file }) =>
    typeof file === "string" ? file === path : file.test(path),
  );
}
