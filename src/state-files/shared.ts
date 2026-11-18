import { Schema } from "effect";

/** Milliseconds since the epoch, as the old code's `now()` writes them. */
export const Millis = Schema.Int;

/**
 * `{}` and nothing else. `Schema.Struct({})` alone accepts any value that is
 * not null, so the check is what refuses a key.
 */
export const EmptyObject = Schema.Struct({}).check(
  Schema.makeFilter((value) => Object.keys(value).length === 0, {
    expected: "an object with no keys",
  }),
);

/** What a start records about its provider route (providers.py `recorded`). */
export const ProviderBinding = Schema.Union([
  Schema.Struct({ route: Schema.Literal("personal") }),
  Schema.Struct({
    route: Schema.Literal("azure-foundry"),
    agent: Schema.Literals(["claude", "codex"]),
    target: Schema.String,
    deployment: Schema.String,
    auth: Schema.Literals(["entra-id", "api-key", "bearer-token"]),
    fingerprint: Schema.String,
  }),
]);

/** The part of an agent record that exists before its terminal does (launch.py `launch`). */
export const agentStartFields = {
  agent: Schema.String,
  at: Millis,
  parent: Schema.optionalKey(Schema.String),
  config_dir: Schema.optionalKey(Schema.String),
  provider: Schema.optionalKey(ProviderBinding),
};

/** A time rule as `parse_every` returns it (automations.py). */
export const ScheduleRule = Schema.Union([
  Schema.Struct({
    text: Schema.String,
    kind: Schema.Literal("once"),
    at: Schema.String,
  }),
  Schema.Struct({
    text: Schema.String,
    kind: Schema.Literal("interval"),
    minutes: Schema.Int,
    days: Schema.Array(Schema.Int),
    from: Schema.String,
    to: Schema.String,
  }),
  Schema.Struct({
    text: Schema.String,
    kind: Schema.Literal("at"),
    days: Schema.Array(Schema.Int),
    times: Schema.Array(Schema.String),
  }),
]);

/** A task number written as an object key (`str(task["id"])`). */
export const TaskNumberKey = Schema.String.check(Schema.isPattern(/^\d+$/));

/**
 * How one folder's tasks looked at the last look (automations.py
 * `diff_events`). Open by task number: the old code keys it by every task the
 * list holds, beside the one fixed `_init` marker.
 */
export const TaskEventsSeen = Schema.StructWithRest(
  Schema.Struct({ _init: Schema.optionalKey(Schema.Literal(true)) }),
  [
    Schema.Record(
      TaskNumberKey,
      Schema.Struct({
        state: Schema.String,
        status: Schema.String,
        needs: Schema.NullOr(Schema.String),
        attention: Schema.NullOr(Schema.String),
        quiet: Schema.NullOr(Millis),
        stalled: Schema.NullOr(Schema.Boolean),
      }),
    ),
  ],
);
