import type { Schema } from "effect";
import {
  AutopilotState,
  FeedbackState,
  HeldMessages,
  MachinesState,
  NewsLog,
  NewsState,
  ReachMap,
  Retries,
  SchedulerRecord,
  SchedulerSeen,
  SettingsPassStamp,
  StopLogLine,
} from "./engine-state.ts";
import { CoreDocs, CoreTerminals } from "./herdr-core.ts";
import { LaunchJournal, PublicationJournal } from "./journals.ts";
import {
  CliCheck,
  CodexSandbox,
  LayoutNumber,
  MigrateJournal,
} from "./machine-state.ts";
import {
  SentMessages,
  ServiceRecord,
  UsageEvent,
  WebState,
} from "./service-state.ts";
import { ModelPicks, Settings } from "./settings.ts";
import { TaskList } from "./task-list.ts";

/** The program that writes a file today. */
export type Owner =
  | "herdr-task"
  | "service"
  | "window"
  | "installer"
  | "herdr-core";

/**
 * How a file's writers put it on disk today. `lock` is the lock file its
 * writers hold, as a path from the file's folder. `fsync` says the bytes are
 * synced before the rename.
 */
export type WriteDiscipline =
  | { readonly write: "never" }
  | {
      readonly write: "rename" | "in-place" | "append";
      readonly lock: string | null;
      readonly fsync: boolean;
    };

export type Family =
  | "task-lists"
  | "journals"
  | "engine-state"
  | "settings"
  | "service-state"
  | "machine-state"
  | "herdr-core";

export interface StateFile {
  readonly family: Family;
  /** Path from the state root (a home folder on the default layout), or a pattern over it. */
  readonly file: string | RegExp;
  /** `json-lines`: every line is one document of `schema`. */
  readonly format: "json" | "json-lines";
  readonly schema: Schema.Codec<unknown, unknown>;
  readonly owners: readonly Owner[];
  readonly discipline: WriteDiscipline;
}

const CONFIG = ".config/shepherdr";
const DATA = ".local/share/shepherdr";
const TASKS = `${DATA}/tasks`;
const STATE = ".local/state/shepherdr";
const SERVICE = `${STATE}/service`;
const CORE = ".local/state/herdr-core/default";

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
// The scheduler's round and the window's tick write these inside one lock.
const inTick = renamed(".tick.lock");

/**
 * Every state file this program reads or writes, and the only list of them.
 * The first entry that matches a path is its entry, so the named files come
 * before the task list pattern.
 */
export const stateFiles: readonly StateFile[] = [
  {
    family: "journals",
    file: `${TASKS}/.launches.json`,
    format: "json",
    schema: LaunchJournal,
    owners: ["herdr-task"],
    discipline: synced(".launches.lock"),
  },
  {
    family: "journals",
    file: `${TASKS}/.publications.json`,
    format: "json",
    schema: PublicationJournal,
    owners: ["herdr-task"],
    discipline: synced(".publications.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.machines.json`,
    format: "json",
    schema: MachinesState,
    owners: ["herdr-task"],
    discipline: renamed(".machines.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.reach.json`,
    format: "json",
    schema: ReachMap,
    owners: ["herdr-task"],
    discipline: renamed(".reach.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.scheduler.json`,
    format: "json",
    schema: SchedulerRecord,
    owners: ["herdr-task"],
    discipline: inPlace(".scheduler.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.seen.json`,
    format: "json",
    schema: SchedulerSeen,
    owners: ["herdr-task"],
    discipline: inTick,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.retries.json`,
    format: "json",
    schema: Retries,
    owners: ["herdr-task"],
    discipline: inTick,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.news.json`,
    format: "json",
    schema: NewsState,
    owners: ["herdr-task"],
    discipline: inTick,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.newslog.json`,
    format: "json",
    schema: NewsLog,
    owners: ["herdr-task"],
    discipline: inTick,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.held.json`,
    format: "json",
    schema: HeldMessages,
    owners: ["herdr-task"],
    discipline: renamed(".held.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.autopilot.json`,
    format: "json",
    schema: AutopilotState,
    owners: ["herdr-task"],
    discipline: renamed(".autopilot.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.feedback.json`,
    format: "json",
    schema: FeedbackState,
    owners: ["herdr-task"],
    discipline: renamed(".feedback.json.lock"),
  },
  {
    family: "engine-state",
    file: `${TASKS}/.reactions.json`,
    format: "json",
    schema: SettingsPassStamp,
    owners: ["herdr-task"],
    discipline: inTick,
  },
  {
    family: "engine-state",
    file: `${TASKS}/.assistant-settings.json`,
    format: "json",
    schema: SettingsPassStamp,
    owners: ["herdr-task"],
    discipline: inTick,
  },
  {
    // Rewritten whole with its last 500 lines, by whichever command ends an agent.
    family: "engine-state",
    file: `${TASKS}/.stops.jsonl`,
    format: "json-lines",
    schema: StopLogLine,
    owners: ["herdr-task"],
    discipline: renamed(),
  },
  {
    // Any other JSON file in the tasks folder is a folder's task list. A slug
    // can start with a dot, so the name alone cannot tell (store.py
    // `is_task_list` goes by content).
    family: "task-lists",
    file: /^\.local\/share\/shepherdr\/tasks\/[^/]+\.json$/,
    format: "json",
    schema: TaskList,
    owners: ["herdr-task"],
    discipline: renamed(".<slug>.json.lock"),
  },
  {
    family: "settings",
    file: `${CONFIG}/settings.json`,
    format: "json",
    schema: Settings,
    owners: ["window", "service", "herdr-task"],
    discipline: renamed(),
  },
  {
    family: "settings",
    file: `${CONFIG}/model-picks.json`,
    format: "json",
    schema: ModelPicks,
    owners: ["window", "service"],
    discipline: inPlace(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/service.json`,
    format: "json",
    schema: ServiceRecord,
    owners: ["service"],
    discipline: inPlace(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/web.json`,
    format: "json",
    schema: WebState,
    owners: ["service"],
    discipline: inPlace(),
  },
  {
    family: "service-state",
    file: `${SERVICE}/sent.json`,
    format: "json",
    schema: SentMessages,
    owners: ["service"],
    discipline: renamed(),
  },
  {
    // Past 2 MB the log is renamed to usage.1.jsonl and a new one begins.
    family: "service-state",
    file: `${SERVICE}/usage.jsonl`,
    format: "json-lines",
    schema: UsageEvent,
    owners: ["service", "window"],
    discipline: { write: "append", lock: null, fsync: false },
  },
  {
    family: "machine-state",
    file: `${STATE}/cli-check.json`,
    format: "json",
    schema: CliCheck,
    owners: ["herdr-task"],
    discipline: renamed(),
  },
  {
    family: "machine-state",
    file: `${STATE}/codex-sandbox.json`,
    format: "json",
    schema: CodexSandbox,
    owners: ["herdr-task"],
    discipline: renamed(),
  },
  {
    family: "machine-state",
    file: `${STATE}/migrate.json`,
    format: "json",
    schema: MigrateJournal,
    owners: ["herdr-task", "installer"],
    discipline: synced("migrate.lock"),
  },
  {
    family: "machine-state",
    file: `${DATA}/LAYOUT`,
    format: "json",
    schema: LayoutNumber,
    owners: ["herdr-task", "installer"],
    discipline: synced("../../state/shepherdr/migrate.lock"),
  },
  {
    family: "herdr-core",
    file: `${CORE}/docs.json`,
    format: "json",
    schema: CoreDocs,
    owners: ["herdr-core"],
    discipline: { write: "never" },
  },
  {
    family: "herdr-core",
    file: `${CORE}/terminals.json`,
    format: "json",
    schema: CoreTerminals,
    owners: ["herdr-core"],
    discipline: { write: "never" },
  },
];

/** The entry for a path from the state root, with `/` between its parts. */
export function findStateFile(path: string): StateFile | undefined {
  return stateFiles.find(({ file }) =>
    typeof file === "string" ? file === path : file.test(path),
  );
}
