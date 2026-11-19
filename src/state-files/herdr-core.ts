import { Schema } from "effect";

const optional = Schema.optionalKey;

export const HerdrCoreDocsFile = Schema.Struct({
  "shepherdr.node": optional(
    Schema.Struct({ value: Schema.Struct({ serving: Schema.Boolean }) }),
  ).annotateKey({
    description:
      "providers.py settings_source: does this machine serve the web app?",
  }),
  "shepherdr.secrets": optional(
    Schema.Struct({ value: Schema.Struct({ id: optional(Schema.String) }) }),
  ).annotateKey({
    description:
      "machines.py main_here, bin/herdr-secret: the machine that keeps the secrets.",
  }),
  "herdr-app": optional(
    Schema.Struct({
      value: Schema.Struct({
        spaces: optional(
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              name: optional(Schema.NullOr(Schema.String)),
              folder: optional(Schema.NullOr(Schema.String)),
              machine: optional(Schema.NullOr(Schema.String)),
            }),
          ),
        ),
      }),
    }),
  ).annotateKey({
    description:
      "machines.py PROBE: the window's saved spaces, when no window answers.",
  }),
}).annotate({
  description:
    "herdr-core's docs.json: its shared documents by name. Only the three the old code opens the file for are modelled; every other document and field is herdr-core's to change.",
});

export const HerdrCoreTerminalsFile = Schema.Struct({
  terminals: Schema.Record(
    Schema.String,
    Schema.Struct({
      address: Schema.String,
      name: Schema.NullOr(Schema.String),
      state: Schema.String,
      labels: Schema.Record(Schema.String, Schema.String).annotateKey({
        description:
          "Open by label name: Shepherdr's herdr.* labels and anyone else's.",
      }),
      argv: Schema.Array(Schema.String),
      cwd: Schema.String,
      pid: Schema.Int,
      parent: Schema.NullOr(Schema.String),
      template: Schema.NullOr(Schema.String),
      turn: Schema.Int,
      status: Schema.NullOr(Schema.Struct({ state: Schema.String })),
      status_ms: Schema.NullOr(Schema.Int),
      foreground: optional(
        Schema.Struct({
          pid: Schema.Int,
          name: Schema.String,
          argv: Schema.Array(Schema.String),
        }),
      ),
    }),
  ).annotateKey({ description: "Open by terminal address." }),
}).annotate({
  description:
    "herdr-core's terminals.json. The old code never opens it: it reads the same records through hc ls and hc get. These are the fields it uses from those answers, as the file holds them.",
});
