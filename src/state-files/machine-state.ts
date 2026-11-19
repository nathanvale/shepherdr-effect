import { Schema } from "effect";
import { Millis } from "./shared.ts";

const optional = Schema.optionalKey;

const CliState = Schema.NullOr(
  Schema.Literals(["ready", "signed-out", "missing"]),
);

export const CliCheckFile = Schema.Struct({
  at: Millis,
  machines: Schema.Record(
    Schema.String,
    Schema.Struct({
      claude: CliState,
      codex: CliState,
      at: Millis,
      failed: optional(Millis),
    }),
  ).annotateKey({
    description: 'Open by machine name ("" is this machine).',
  }),
}).annotate({
  description:
    "cli-check.json: which agent CLIs each machine can run (takeover.py cli_check_pass).",
});

export const CodexSandboxFile = Schema.Struct({
  key: Schema.Struct({
    codex: Schema.String,
    codex_at: Schema.NullOr(Schema.String),
    bwrap: Schema.String,
    bwrap_at: Schema.NullOr(Schema.String),
    userns: Schema.NullOr(Schema.String),
    profile: Schema.NullOr(Schema.String),
    limits: Schema.Array(Schema.NullOr(Schema.String)),
  }),
  at: Schema.Number.annotateKey({
    description: "Seconds with a fraction (time.time()), not milliseconds.",
  }),
  broken: Schema.NullOr(
    Schema.Struct({
      error: Schema.String,
      bwrap: Schema.String,
      userns: Schema.Boolean,
      at: Schema.Int,
    }),
  ),
}).annotate({
  description:
    "codex-sandbox.json: whether Codex's sandbox starts here, and what that answer depends on (sandbox.py).",
});

const MovedKind = Schema.Literals([
  "settings",
  "model-picks",
  "tasks",
  "artifacts",
  "vault",
  "secret-remote",
  "tools",
  "service",
  "browser",
  "secret-drop",
  "secret-served",
  "cli-check",
  "machine-hold",
]).annotate({
  description:
    "layout.py KINDS: everything the move to Shepherdr's own folders carries.",
});

export const MigrateFile = Schema.Struct({
  started: optional(Millis),
  kinds: optional(
    Schema.Record(
      MovedKind,
      optional(
        Schema.Literals([
          "renaming",
          "moved",
          "copied",
          "swapping",
          "swapped",
          "kept",
        ]),
      ),
    ),
  ),
  backups: optional(Schema.Record(MovedKind, optional(Schema.String))),
  finished: optional(Millis),
  notes: optional(Schema.Array(Schema.String)),
  cleaned: optional(Millis),
}).annotate({
  description:
    "migrate.json: the journal of the move from ~/.herdr (layout.py _move_kind, migrate, cleanup).",
});

export const LayoutFile = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
).annotate({
  description:
    "The LAYOUT file: the layout number this machine's data is on, as digits and a new line (layout.py migrate). That is also a JSON document, so it is read as one.",
});
