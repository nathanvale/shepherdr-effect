import { Schema } from "effect";

const optional = Schema.optionalKey;

/**
 * herdr-core's `docs.json`: its shared documents by name. Only the three the
 * old code opens the file for are modelled; every other document and field is
 * herdr-core's to change.
 */
export const HerdrCoreDocsFile = Schema.Struct({
  // providers.py `settings_source`: does this machine serve the web app?
  "shepherdr.node": optional(
    Schema.Struct({ value: Schema.Struct({ serving: Schema.Boolean }) }),
  ),
  // machines.py `main_here`, bin/herdr-secret: the machine that keeps the secrets.
  "shepherdr.secrets": optional(
    Schema.Struct({ value: Schema.Struct({ id: optional(Schema.String) }) }),
  ),
  // machines.py `PROBE`: the window's saved spaces, when no window answers.
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
  ),
});

/**
 * herdr-core's `terminals.json`. The old code never opens it: it reads the
 * same records through `hc ls` and `hc get`. These are the fields it uses
 * from those answers, as the file holds them.
 */
export const HerdrCoreTerminalsFile = Schema.Struct({
  // Open by terminal address.
  terminals: Schema.Record(
    Schema.String,
    Schema.Struct({
      address: Schema.String,
      name: Schema.NullOr(Schema.String),
      state: Schema.String,
      // Open by label name: Shepherdr's `herdr.*` labels and anyone else's.
      labels: Schema.Record(Schema.String, Schema.String),
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
  ),
});
