import { Schema } from "effect";
import {
  agentStartFields,
  EmptyObject,
  Millis,
  ScheduleRule,
  TaskEventsSeen,
} from "./shared.ts";

const optional = Schema.optionalKey;
const Flag = Schema.Literal(true);

/** An agent started for a task (launch.py `launch`, sessions.py). */
const TaskAgent = Schema.Struct({
  ...agentStartFields,
  address: Schema.String,
  // Absent on an agent taken over from the old Tasks panel (store.py `migrate`).
  argv: optional(Schema.Array(Schema.String)),
  launch: optional(Schema.String),
  session: optional(Schema.String),
  log: optional(Schema.String),
  log_looked: optional(Millis),
  ended: optional(Millis),
});

const Progress = Schema.Struct({
  text: Schema.String,
  at: Millis,
  set: Millis,
  done: optional(Schema.Int),
  left: optional(Schema.Int),
  paused_at: optional(Millis),
  by: optional(Schema.Literal("herdr")),
});

const Review = Schema.Struct({
  round: Schema.Int,
  result: Schema.Literals(["report", "pass", "changes"]),
  text: Schema.String,
  at: Millis,
  head: Schema.NullOr(Schema.String),
  by: Schema.NullOr(Schema.String),
});

/** What a queued or scheduled start will run (commands.py `cmd_start`, `cmd_add`). */
const QueuedStart = Schema.Struct({
  argv: optional(Schema.Array(Schema.String)),
  space: optional(Schema.NullOr(Schema.String)),
  parent: optional(Schema.NullOr(Schema.String)),
  config_dir: optional(Schema.NullOr(Schema.String)),
  custom: optional(Flag),
});

/** A task's own overrides of Settings (settings.py `set_task`). */
const TaskSettings = Schema.Struct({
  review: optional(Schema.Literals(["on", "off"])),
  proof: optional(Schema.Literals(["on", "off"])),
  review_rounds: optional(Schema.Int),
  must_fix: optional(Schema.Literals(["blocker", "major", "minor"])),
  merge: optional(Schema.Literals(["ask", "checks", "auto"])),
});

const PullRequest = Schema.Struct({
  number: Schema.Int,
  url: Schema.String,
  repo: Schema.String,
  provider: optional(Schema.Literals(["github", "bitbucket"])),
  host: optional(Schema.String),
  branch: optional(Schema.String),
  adopted: optional(Millis),
  adopted_head: optional(Schema.NullOr(Schema.String)),
  checked: optional(Millis),
  wait: optional(Schema.String),
  needs_approval: optional(Flag),
  checks_unknown: optional(Flag),
  expects: optional(
    Schema.Struct({ sha: Schema.String, is: Schema.NullOr(Schema.String) }),
  ),
  head_at: optional(Millis),
  head_sha: optional(Schema.String),
  // ghnews.py `pr_news`: what was already told, and news waiting for its agent.
  watch: optional(
    Schema.Struct({
      since: Millis,
      seen: Schema.Array(Schema.String),
      checked: Millis,
      failed: Schema.NullOr(Schema.String),
      conflict: Schema.NullOr(Schema.String),
    }),
  ),
  news: optional(
    Schema.Struct({ text: Schema.String, at: Millis, since: Millis }),
  ),
});

/** Another folder's or machine's task this one waits for (queues.py `set_after`). */
const ExternalDependency = Schema.Struct({
  ref: Schema.String,
  machine: Schema.NullOr(Schema.String),
  prefix: Schema.String,
  id: Schema.Int,
  state: Schema.String,
  checked: Millis,
  error: optional(Schema.String),
});

/** The one takeover by the other CLI (takeover.py). */
const Backup = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  why: Schema.String,
  at: Millis,
  from_address: Schema.String,
  state: Schema.Literals(["starting", "uncertain", "failed", "started"]),
  launch: optional(Schema.NullOr(Schema.String)),
  error: optional(Schema.String),
  address: optional(Schema.String),
  told: optional(Flag),
});

/** Set once on a task taken over from the old Tasks panel (store.py `migrate`). */
const takenOver = {
  legacy_id: optional(
    Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
  ),
  tab: optional(Schema.NullOr(Schema.String)),
};

const placement = {
  space: optional(Schema.NullOr(Schema.String)),
  worktree: optional(Schema.String),
  branch: optional(Schema.String),
  base: optional(Schema.String),
  start: optional(Schema.String),
  base_set: optional(Flag),
  base_by: optional(Schema.Literals(["space", "pull-request"])),
  folder_start: optional(Schema.NullOr(Schema.String)),
  own: optional(Schema.String),
};

/** What runs the task and how, where the task says so itself instead of Settings. */
const ownChoices = {
  agent: optional(Schema.String),
  model: optional(Schema.String),
  effort: optional(Schema.String),
  reviewer: optional(Schema.String),
  reviewer_model: optional(Schema.String),
  reviewer_effort: optional(Schema.String),
  deployment: optional(Schema.String),
  selection_routing: optional(Schema.String),
  select_rev: optional(Schema.Int),
  pick_at: optional(Millis),
  set: optional(TaskSettings),
  start_notes: optional(Schema.String),
  finish_notes: optional(Schema.String),
  automation: optional(Schema.Int),
};

const waitingToStart = {
  queue: optional(QueuedStart),
  queued_at: optional(Millis),
  scheduled_for: optional(Millis),
  held: optional(Schema.String),
  after: optional(Schema.Array(Schema.Int)),
  after_ext: optional(Schema.Array(ExternalDependency)),
};

const whileRunning = {
  started: optional(Millis),
  alive: optional(Schema.Boolean),
  progress: optional(Progress),
  retry: optional(
    Schema.Struct({
      address: Schema.String,
      reason: Schema.String,
      tries: Schema.Int,
      due: optional(Millis),
      over: optional(Flag),
    }),
  ),
  backup: optional(Backup),
  attention: optional(Schema.String),
  attention_at: optional(Millis),
  waits: optional(Schema.String),
  trust_ask: optional(Schema.String),
  held_ask: optional(Schema.String),
  own_work: optional(Flag),
  back: optional(
    Schema.Struct({
      at: Millis,
      why: Schema.String,
      auto: optional(Flag),
      progress: optional(Schema.NullOr(Progress)),
    }),
  ),
  reopened_at: optional(Millis),
};

const review = {
  review_gate: optional(Flag),
  brief_review: optional(
    Schema.Struct({
      on: Schema.Boolean,
      by: Schema.NullOr(Schema.String),
      rounds: optional(Schema.Int),
      rounds_by: optional(Schema.NullOr(Schema.String)),
    }),
  ),
  reviews: optional(Schema.Array(Review)),
  review_rounds_added: optional(Schema.Int),
  review_out: optional(Millis),
};

const ready = {
  ready_at: optional(Millis),
  // Open by terminal address: every agent live at ready, with its turn then.
  ready_turns: optional(Schema.Record(Schema.String, Schema.Int)),
  head: optional(Schema.String),
  summary: optional(Schema.String),
  details: optional(Schema.String),
  proof: optional(Schema.Struct({ id: Schema.String, title: Schema.String })),
  agents_md: optional(Schema.String),
  nothing_to_merge: optional(Flag),
  handed_at: optional(Millis),
  fix_requested: optional(Millis),
};

const merge = {
  pr: optional(PullRequest),
  pr_note: optional(
    Schema.Struct({
      number: Schema.Int,
      id: optional(Schema.NullOr(Schema.Int)),
      said: Schema.String,
    }),
  ),
  adopted_from: optional(
    Schema.Struct({ base: Schema.String, at: Millis, pr: Schema.Int }),
  ),
  gh_checked: optional(Millis),
  _pr_fresh: optional(Schema.Boolean),
  auto_merge: optional(Schema.Literals(["auto", "checks"])),
  merge_requested: optional(Millis),
  merge_queued: optional(Millis),
  requeued: optional(Schema.String),
  merged: optional(Schema.Boolean),
  merged_head: optional(Schema.String),
  landed: optional(Flag),
  kept_open: optional(Flag),
};

const afterDone = {
  accepted_at: optional(Millis),
  done_at: optional(Millis),
  ended_at: optional(Millis),
  kept: optional(Schema.String),
  worktree_kept: optional(Millis),
  worktree_removed_at: optional(Millis),
  archived: optional(Millis),
  unarchived: optional(Millis),
};

/**
 * One task. Only the first seven keys are always there (store.py `new`). Each
 * group after them is set and removed by the commands that own that step.
 */
const Task = Schema.Struct({
  id: Schema.Int,
  title: Schema.String,
  prompt: Schema.String,
  mode: Schema.Literals(["here", "worktree"]),
  state: Schema.Literals([
    "todo",
    "scheduled",
    "queued",
    "running",
    "ready",
    "done",
  ]),
  created: Millis,
  agents: Schema.Array(TaskAgent),
  reviewers: optional(Schema.Array(TaskAgent)),
  ...takenOver,
  ...placement,
  ...ownChoices,
  ...waitingToStart,
  ...whileRunning,
  ...review,
  ...ready,
  ...merge,
  ...afterDone,
});

/** `--set` pairs an automation gives each task it adds (automations.py `set_auto_fields`). */
const AutomationSettings = Schema.Struct({
  review: optional(Schema.String),
  merge: optional(Schema.String),
  rounds: optional(Schema.String),
  mustfix: optional(Schema.String),
  agent: optional(Schema.String),
  model: optional(Schema.String),
  effort: optional(Schema.String),
  reviewer: optional(Schema.String),
  "reviewer.model": optional(Schema.String),
  "reviewer.effort": optional(Schema.String),
  proof: optional(Schema.String),
});

/** A task that adds itself again on a schedule or an event (automations.py). */
const Automation = Schema.Struct({
  id: Schema.Int,
  title: Schema.String,
  prompt: Schema.String,
  created: Millis,
  paused: Schema.Boolean,
  mode: Schema.Literals(["here", "worktree"]),
  runs: Schema.Array(
    Schema.Struct({
      at: Millis,
      why: Schema.String,
      task: Schema.String,
      from: optional(Schema.String),
      queued: optional(Schema.String),
      error: optional(Schema.String),
    }),
  ),
  every: optional(Schema.NullOr(ScheduleRule)),
  next_run: optional(Schema.NullOr(Millis)),
  on: optional(Schema.NullOr(Schema.Array(Schema.String))),
  match: optional(Schema.NullOr(Schema.String)),
  from: optional(
    Schema.Struct({
      machine: Schema.NullOr(Schema.String),
      folder: Schema.String,
    }),
  ),
  from_seen: optional(TaskEventsSeen),
  agent: optional(Schema.String),
  space: optional(Schema.NullOr(Schema.String)),
  parent: optional(Schema.String),
  set: optional(AutomationSettings),
  trigger: optional(Schema.String),
  warning: optional(Schema.NullOr(Schema.String)),
  last_error: optional(
    Schema.Struct({ at: Millis, message: Schema.String, kind: Schema.String }),
  ),
  last_run: optional(Millis),
  last_task: optional(Schema.String),
});

/** A base branch watched on GitHub after a merge (github.py `watch_main`, ghnews.py). */
const MainWatch = Schema.Struct({
  repo: Schema.String,
  until: Millis,
  space: Schema.NullOr(Schema.String),
  merged: Schema.Array(
    Schema.Struct({
      ref: Schema.String,
      title: Schema.String,
      pr: Schema.Int,
      at: Millis,
      sha: optional(Schema.String),
    }),
  ),
  checked: optional(Millis),
  green: optional(Schema.String),
  red: optional(Schema.String),
  notice: optional(
    Schema.Struct({
      text: Schema.String,
      at: Millis,
      space: Schema.NullOr(Schema.String),
      sent: optional(Millis),
      dropped: optional(Flag),
    }),
  ),
});

/** One folder's tasks: `tasks/<slug>.json` (store.py `Store`). */
export const TaskList = Schema.Struct({
  version: Schema.Literal(1),
  folder: Schema.String,
  kind: Schema.Literals(["repo", "folder"]),
  name: Schema.String,
  slug: Schema.String,
  next: Schema.Int,
  tasks: Schema.Array(Task),
  prefix: optional(Schema.String),
  project_id: optional(Schema.String),
  // Nothing at 9859c344 puts a key in it (commands.py `cmd_config`).
  config: optional(EmptyObject),
  github: optional(
    Schema.Struct({
      repo: Schema.NullOr(Schema.String),
      host: Schema.NullOr(Schema.String),
      at: Millis,
      remotes: Schema.NullOr(Schema.String),
    }),
  ),
  github_checks: optional(
    Schema.Struct({
      repo: Schema.NullOr(Schema.String),
      at: Millis,
      denied: Flag,
    }),
  ),
  // Open by branch name: one record per base branch being watched.
  main_watch: optional(Schema.Record(Schema.String, MainWatch)),
  automations: optional(Schema.Array(Automation)),
  auto_next: optional(Schema.Int),
});
