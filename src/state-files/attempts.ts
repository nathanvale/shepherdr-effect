import { Schema } from "effect";
import {
  agentRowFieldsBeforeTerminal,
  Millis,
  RecordedBinding,
} from "./shared.ts";

const optional = Schema.optionalKey;
const Flag = Schema.Literal(true);

const LaunchId = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  ),
).annotate({ description: "launch_admission.py LAUNCH_ID." });
const LaunchIdentity = Schema.String.check(
  Schema.isPattern(/^(?:task|coordinator|agent):[A-Za-z0-9._:/#@-]{1,240}$/),
).annotate({ description: "launch_admission.py IDENTITY." });

const TaskAssignment = Schema.Struct({
  folder: Schema.String,
  id: Schema.Int,
  space: Schema.NullOr(Schema.String),
  role: Schema.NullOr(Schema.String),
  agent: Schema.Struct({
    ...agentRowFieldsBeforeTerminal,
    argv: Schema.Array(Schema.String),
  }),
  made: Schema.Struct({
    mode: optional(Schema.Literals(["here", "worktree"])),
    worktree: optional(Schema.String),
    branch: optional(Schema.String),
    base: optional(Schema.String),
    start: optional(Schema.String),
  }),
}).annotate({
  description:
    "A task start as the journal keeps it, so a reconcile can put it on the task (launch.py launch).",
});

const fieldsWrittenAtIntent = {
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
};

const fieldsWrittenBeforeSend = {
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
  invocation: optional(Schema.String).annotateKey({
    description: "In the pilot's journal. No writer at 9859c344 sets it.",
  }),
};

const fieldsWrittenWhenLaunchCloses = {
  address: optional(Schema.String),
  reply: optional(Schema.String),
  reason: optional(Schema.String),
  reconciled: optional(Flag),
  revoked: optional(Flag),
  recorded: optional(Schema.Boolean),
};

const LaunchRecord = Schema.Struct({
  ...fieldsWrittenAtIntent,
  ...fieldsWrittenBeforeSend,
  ...fieldsWrittenWhenLaunchCloses,
});

export const LaunchesFile = Schema.Struct({
  version: Schema.Literal(1),
  launches: Schema.Record(LaunchId, LaunchRecord).annotateKey({
    description:
      "Open by launch id: one record per start, kept 30 days after it closes.",
  }),
  claims: Schema.Record(LaunchIdentity, LaunchId).annotateKey({
    description:
      "Open by identity: the one open start each task or Assistant may have.",
  }),
}).annotate({
  description:
    "tasks/.launches.json: every agent start on this machine (launch_admission.py).",
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
    seen: Schema.Struct({
      written: Schema.String,
      pushurl: Schema.String,
      used: Schema.String,
      push: Schema.String,
    }).annotateKey({
      description:
        "Every view git has of the remote's URL (bitbucket_http.py origins).",
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

export const PublicationsFile = Schema.Struct({
  version: Schema.Literal(1),
  claims: Schema.Record(Schema.String, PublicationRecord).annotateKey({
    description:
      'Open by "<host>/<repo>:<branch>": one claim per published task branch.',
  }),
}).annotate({
  description:
    "tasks/.publications.json: this machine's Bitbucket publication claims (publications.py). The pilot copy holds no such file, so this shape comes from the writer alone.",
});
