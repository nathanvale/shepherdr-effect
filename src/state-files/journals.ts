import { Schema } from "effect";
import { agentStartFields, Millis, RecordedBinding } from "./shared.ts";

const optional = Schema.optionalKey;
const Flag = Schema.Literal(true);

// launch_admission.py `LAUNCH_ID` and `IDENTITY`.
const LaunchId = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  ),
);
const LaunchIdentity = Schema.String.check(
  Schema.isPattern(/^(?:task|coordinator|agent):[A-Za-z0-9._:/#@-]{1,240}$/),
);

/** A task start as the journal keeps it, so a reconcile can put it on the task (launch.py `launch`). */
const TaskAssignment = Schema.Struct({
  folder: Schema.String,
  id: Schema.Int,
  space: Schema.NullOr(Schema.String),
  role: Schema.NullOr(Schema.String),
  agent: Schema.Struct({
    ...agentStartFields,
    argv: Schema.Array(Schema.String),
  }),
  made: Schema.Struct({
    mode: optional(Schema.Literals(["here", "worktree"])),
    worktree: optional(Schema.String),
    branch: optional(Schema.String),
    base: optional(Schema.String),
    start: optional(Schema.String),
  }),
});

const LaunchRecord = Schema.Struct({
  // Written at the claim (launch_admission.py `Admission.claimed`).
  launch: LaunchId,
  identity: LaunchIdentity,
  role: Schema.Literals(["task", "reviewer", "coordinator", "agent", "revive"]),
  state: Schema.Literals([
    "never-submitted",
    "submission-uncertain",
    "confirmed",
    "cancelled",
  ]),
  at: Millis,
  updated: Millis,
  revision: Schema.String,
  space: Schema.NullOr(Schema.String),
  machine: Schema.String,
  parent: Schema.NullOr(Schema.String),
  pid: Schema.Int,
  config_dir: Schema.NullOr(Schema.String),

  // Written just before `hc run` or `hc send` (`_mark_sent`).
  sent_at: optional(Millis),
  task: optional(TaskAssignment),
  provider: optional(RecordedBinding),
  missing_history: optional(Flag),
  terminal: optional(Schema.String),
  terminal_pid: optional(Schema.NullOr(Schema.Int)),
  revival: optional(
    Schema.Struct({
      how: Schema.String,
      missing_history: Schema.Boolean,
      session: Schema.NullOr(Schema.String),
      previous_session: Schema.NullOr(Schema.String),
    }),
  ),
  // In the pilot's journal. No writer at 9859c344 sets it.
  invocation: optional(Schema.String),

  // Written when the start closes (`_close`, `launch recover`, `launch reconcile`).
  address: optional(Schema.String),
  reply: optional(Schema.String),
  reason: optional(Schema.String),
  reconciled: optional(Flag),
  revoked: optional(Flag),
  recorded: optional(Schema.Boolean),
});

/** `tasks/.launches.json`: every agent start on this machine (launch_admission.py). */
export const LaunchesFile = Schema.Struct({
  version: Schema.Literal(1),
  // Open by launch id: one record per start, kept 30 days after it closes.
  launches: Schema.Record(LaunchId, LaunchRecord),
  // Open by identity: the one open start each task or Assistant may have.
  claims: Schema.Record(LaunchIdentity, LaunchId),
});

const BitbucketPullRequest = Schema.Struct({
  provider: Schema.Literal("bitbucket"),
  host: Schema.String,
  repo: Schema.String,
  number: Schema.Int,
  url: Schema.String,
});

const StageState = Schema.Literals(["uncertain", "confirmed"]);

const PublicationRecord = Schema.Struct({
  repo: Schema.String,
  branch: Schema.String,
  base: Schema.NullOr(Schema.String),
  owner: Schema.Struct({
    task: Schema.String,
    folder: Schema.String,
    worktree: Schema.NullOr(Schema.String),
    machine: Schema.String,
  }),
  route: Schema.Struct({
    remote: Schema.String,
    push: Schema.String,
    // Every view git has of the remote's URL (bitbucket_http.py `origins`).
    seen: Schema.Struct({
      written: Schema.String,
      pushurl: Schema.String,
      used: Schema.String,
      push: Schema.String,
    }),
  }),
  pushed: Schema.NullOr(
    Schema.Struct({
      head: Schema.String,
      to: Schema.String,
      at: Millis,
      id: optional(Schema.String),
      found: optional(Flag),
    }),
  ),
  push: optional(
    Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        head: Schema.String,
        expect: Schema.NullOr(Schema.String),
        state: Schema.Literal("uncertain"),
        sent: Millis,
      }),
    ),
  ),
  draft: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      state: StageState,
      head: Schema.NullOr(Schema.String),
      pr: optional(BitbucketPullRequest),
      kept: optional(Schema.Literals(["saved", "adopted"])),
      sent: optional(Millis),
      confirmed: optional(Millis),
    }),
  ),
  ready: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      state: StageState,
      head: Schema.NullOr(Schema.String),
      pr: BitbucketPullRequest,
      sent: Millis,
      confirmed: optional(Millis),
    }),
  ),
  refused: optional(
    Schema.Struct({ id: Schema.String, why: Schema.String, at: Millis }),
  ),
  made: Millis,
  at: Millis,
});

/**
 * `tasks/.publications.json`: this machine's Bitbucket publication claims
 * (publications.py). The pilot copy holds no such file, so this shape comes
 * from the writer alone.
 */
export const PublicationsFile = Schema.Struct({
  version: Schema.Literal(1),
  // Open by "<host>/<repo>:<branch>": one claim per published task branch.
  claims: Schema.Record(Schema.String, PublicationRecord),
});
