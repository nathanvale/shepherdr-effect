import { Schema } from "effect";
import {
  Millis,
  ScheduleRule,
  TaskEventsSeen,
  TaskNumberKey,
} from "./shared.ts";

const optional = Schema.optionalKey;
const Flag = Schema.Literal(true);

export const MachinesFile = Schema.Struct({
  seen: optional(Schema.String),
  seen_at: optional(Millis),
  machines: optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        link: optional(Schema.NullOr(Schema.String)),
        state: optional(Schema.String),
        checked: optional(Millis),
        details: optional(Schema.Array(Schema.String)),
        synced: optional(Schema.String),
        synced_try: optional(Schema.String),
        at: optional(Millis),
      }),
    ),
  ).annotateKey({
    description:
      "Open by machine name: one record per machine herdr-core links.",
  }),
}).annotate({
  description:
    "tasks/.machines.json: what was last synced to each linked machine (machines.py).",
});

interface ReachNodeEncoded {
  readonly host: string;
  readonly user: string;
  readonly os: string;
  readonly hc: boolean;
  readonly home: string;
  readonly core: { readonly id: string; readonly name: string } | null;
  readonly tools: string | null;
  readonly links: readonly {
    readonly how: "herdr-core";
    readonly to: string | null;
    readonly id: string | null;
    readonly target: string | null;
    readonly state: string | null;
    readonly ok: boolean;
    readonly next?: ReachNodeEncoded | { readonly error: string };
  }[];
  readonly spaces?: readonly {
    readonly id: string;
    readonly name: string | null;
    readonly folder: string | null;
    readonly machine: string | null;
    readonly icon: string | null;
  }[];
  readonly assistants?: readonly {
    readonly address: string;
    readonly space: string | null;
    readonly space_name: string | null;
    readonly folder: string | null;
    readonly template: string | null;
    readonly name: string | null;
  }[];
}

const ReachNode: Schema.Codec<ReachNodeEncoded> = Schema.Struct({
  host: Schema.String,
  user: Schema.String,
  os: Schema.String,
  hc: Schema.Boolean,
  home: Schema.String,
  core: Schema.NullOr(
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  ).annotateKey({
    description:
      "herdr-core's own answer to hc server status: only what the pilot shows.",
  }),
  tools: Schema.NullOr(Schema.String),
  links: Schema.Array(
    Schema.Struct({
      how: Schema.Literal("herdr-core"),
      to: Schema.NullOr(Schema.String),
      id: Schema.NullOr(Schema.String),
      target: Schema.NullOr(Schema.String),
      state: Schema.NullOr(Schema.String),
      ok: Schema.Boolean,
      next: optional(
        Schema.Union([
          Schema.suspend(() => ReachNode),
          Schema.Struct({ error: Schema.String }),
        ]),
      ),
    }),
  ),
  spaces: optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.NullOr(Schema.String),
        folder: Schema.NullOr(Schema.String),
        machine: Schema.NullOr(Schema.String),
        icon: Schema.NullOr(Schema.String),
      }),
    ),
  ).annotateKey({
    description: "Absent on a machine without hc.",
  }),
  assistants: optional(
    Schema.Array(
      Schema.Struct({
        address: Schema.String,
        space: Schema.NullOr(Schema.String),
        space_name: Schema.NullOr(Schema.String),
        folder: Schema.NullOr(Schema.String),
        template: Schema.NullOr(Schema.String),
        name: Schema.NullOr(Schema.String),
      }),
    ),
  ).annotateKey({
    description: "Absent on a machine without hc.",
  }),
}).annotate({
  description:
    "One machine as the reach probe answers (machines.py PROBE). A link's next holds the machine it leads to, so the shape refers to itself.",
});

export const ReachFile = Schema.Struct({
  at: Millis,
  graph: ReachNode,
}).annotate({
  description:
    "tasks/.reach.json: the machines reachable from here, hop by hop (machines.py probe).",
});

export const SchedulerFile = Schema.Struct({
  pid: Schema.Int,
  hash: Schema.String,
  at: Millis,
  terminal: Schema.NullOr(Schema.String),
}).annotate({
  description:
    "tasks/.scheduler.json: the one scheduler running here (automations.py cmd_scheduler).",
});

export const SeenFile = Schema.Record(Schema.String, TaskEventsSeen).annotate({
  description:
    "tasks/.seen.json: how each folder's tasks looked at the scheduler's last round (automations.py one_pass). The file itself is the map: open by task list slug, one record per folder with tasks at work or automations.",
});

export const RetriesFile = Schema.Record(
  Schema.String,
  Schema.Struct({
    address: Schema.String,
    log: optional(Schema.NullOr(Schema.String)),
    pid: optional(Schema.NullOr(Schema.Int)),
    role: optional(Schema.String),
    space: optional(Schema.NullOr(Schema.String)),
    cut: optional(Schema.String),
    tries: optional(Schema.Int),
    reason: optional(Schema.String),
    at: optional(Millis),
    due: optional(Millis),
    over: optional(Flag),
    nudged: optional(Millis),
    stale: optional(Flag),
    task: optional(Schema.String),
  }),
).annotate({
  description:
    "tasks/.retries.json: provider retries under way (tick.py retry_pass). The file itself is the map: open by terminal address, one row per live Assistant or task worker whose log is being followed.",
});

export const NewsFile = Schema.Struct({
  seen: Schema.Record(
    Schema.String,
    Schema.StructWithRest(Schema.Struct({ _init: optional(Flag) }), [
      Schema.Record(
        TaskNumberKey,
        Schema.Struct({
          status: Schema.Literals([
            "todo",
            "scheduled",
            "queued",
            "working",
            "needs",
            "ready",
            "merging",
            "done",
          ]),
          stall: Schema.NullOr(Schema.String),
          needs: optional(Schema.String),
        }),
      ),
    ]),
  ).annotateKey({
    description:
      "Open by task list slug, then by task number beside the _init marker.",
  }),
  outbox: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      space: Schema.String,
      folder: Schema.String,
      event: Schema.String,
      status: Schema.String,
      stall: Schema.NullOr(Schema.String),
      text: Schema.String,
      at: Millis,
    }),
  ),
  quiet: Schema.Record(
    Schema.String,
    Schema.Struct({ turn: Schema.NullOr(Schema.Int), at: Millis }),
  ).annotateKey({
    description:
      "Open by terminal address: Assistants told news while their chat was read.",
  }),
}).annotate({
  description:
    "tasks/.news.json: each task's last told status, and lines not sent yet (news.py news_pass).",
});

export const NewslogFile = Schema.Array(
  Schema.Struct({
    at: Millis,
    space: Schema.String,
    folder: Schema.NullOr(Schema.String),
    to: Schema.String,
    lines: Schema.Array(Schema.String),
  }),
).annotate({
  description:
    "tasks/.newslog.json: the last 300 news batches sent, for the home overview (home.py log_news).",
});

export const HeldFile = Schema.Record(
  Schema.String,
  Schema.Array(
    Schema.Struct({
      text: Schema.String,
      how: Schema.Literals(["send", "news"]),
      at: Millis,
    }),
  ),
).annotate({
  description:
    "tasks/.held.json: messages waiting while the person writes to an agent (news.py hold). The file itself is the map: open by terminal address.",
});

const Wake = Schema.Struct({
  at: Millis,
  reason: Schema.String,
  outcome: Schema.String,
});
const Note = Schema.Struct({ text: Schema.String, at: Millis });

export const AutopilotFile = Schema.Struct({
  version: Schema.Literal(2),
  everywhere: Schema.Struct({
    every: Schema.NullOr(ScheduleRule),
    events: Schema.Array(Schema.String),
  }).annotateKey({
    description: "From before Settings kept the schedule and events.",
  }),
  spaces: Schema.Record(
    Schema.String,
    Schema.Struct({
      on: optional(Schema.Boolean),
      name: optional(Schema.NullOr(Schema.String)),
      folder: optional(Schema.NullOr(Schema.String)),
      next_run: optional(Schema.NullOr(Millis)),
      applied: optional(
        Schema.Struct({
          on: Schema.Boolean,
          every: Schema.NullOr(Schema.String),
          events: Schema.Array(Schema.String),
        }),
      ),
      pending: optional(
        Schema.Struct({ reasons: Schema.Array(Schema.String), at: Millis }),
      ),
      inflight: optional(
        Schema.Struct({
          at: Millis,
          reason: Schema.String,
          to: Schema.String,
          turn: Schema.Int,
        }),
      ),
      last_wake: optional(Wake),
      wakes: optional(Schema.Array(Wake)),
      progress: optional(Note),
      completed: optional(Note),
      seen: optional(Schema.Record(Schema.String, TaskEventsSeen)).annotateKey({
        description:
          "Open by task list slug: the folders whose task events wake this space.",
      }),
    }),
  ).annotateKey({
    description:
      "Open by space id: one record per space whose switch was ever touched.",
  }),
}).annotate({
  description:
    "tasks/.autopilot.json: each space's switch and how its wakes go (autopilot.py).",
});

export const FeedbackFile = Schema.Struct({
  problems: Schema.Record(
    Schema.String.check(Schema.isPattern(/^[0-9a-f]{10}$/)),
    Schema.Struct({
      line: Schema.String,
      state: Schema.Literals([
        "told",
        "later",
        "offered",
        "declined",
        "filing",
        "filed",
      ]),
      at: Millis,
      space: optional(Schema.NullOr(Schema.String)),
      details: optional(Schema.String),
      agent: optional(Schema.String),
      by: optional(Schema.String),
      url: optional(Schema.String),
    }),
  ).annotateKey({
    description:
      "Open by problem key: ten hex digits of a hash of the problem's one line.",
  }),
}).annotate({
  description:
    "tasks/.feedback.json: problems in Shepherdr itself that agents reported (feedback.py).",
});

export const SettingsPassFile = Schema.Struct({
  mtime: Schema.Number,
  at: Millis,
}).annotate({
  description:
    "tasks/.reactions.json and tasks/.assistant-settings.json: when a pass last looked at the settings file, and that file's modification time then (reactions.py reactions_pass, assistant_settings.py settings_pass).",
});

const StoppedTerminal = Schema.Struct({
  address: Schema.String,
  state: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
  foreground: Schema.NullOr(Schema.String),
  role: Schema.NullOr(Schema.String),
});

export const StopsLine = Schema.Union([
  Schema.Struct({
    at: Millis,
    kind: Schema.Literal("resume-retire"),
    task: Schema.String,
    terminal: Schema.String,
    by: Schema.Literal("resume"),
  }),
  Schema.Struct({
    at: Millis,
    kind: Schema.Literal("switch-kill"),
    task: Schema.String,
    terminal: Schema.String,
    by: Schema.Literal("switch"),
  }),
  Schema.Struct({
    at: Millis,
    kind: Schema.Literal("takeover-kill"),
    task: Schema.String,
    terminal: Schema.String,
    why: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    at: Millis,
    kind: Schema.Literal("end-done"),
    task: Schema.String,
    terminal: Schema.String,
    status: Schema.NullOr(Schema.String),
    pressed: Schema.Boolean,
  }),
  Schema.Struct({
    at: Millis,
    kind: Schema.Literal("gone"),
    task: Schema.String,
    memory: Schema.Number,
    load: Schema.Number,
    terminals: Schema.Array(StoppedTerminal),
  }),
  Schema.Struct({
    at: Millis,
    kind: Schema.Literal("memory-guard"),
    memory: Schema.Number,
    terminals: Schema.Array(Schema.String),
  }),
]).annotate({
  description:
    "One line of tasks/.stops.jsonl: an agent that was ended or went missing (base.py stop_note). Each kind carries its own fields.",
});
