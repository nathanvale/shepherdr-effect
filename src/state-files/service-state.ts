import { Schema } from "effect";
import { Millis } from "./shared.ts";

const optional = Schema.optionalKey;

export const ServiceFile = Schema.Struct({
  port: Schema.Int,
  id: Schema.String,
  pid: Schema.Int,
  version: Schema.String,
}).annotate({
  description:
    "service/service.json: this start of the service (service/main.ts).",
});

export const WebFile = Schema.Struct({
  on: Schema.Boolean,
  link: Schema.NullOr(Schema.String),
  qr: Schema.NullOr(Schema.String),
  why: Schema.NullOr(Schema.String),
  share_error: Schema.NullOr(Schema.String),
  https_port: Schema.Int,
  serve: Schema.Struct({
    rows: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        here: Schema.Boolean,
        state: Schema.String.annotateKey({
          description:
            "herdr-core's word for a machine link, passed through as it is.",
        }),
        os: Schema.NullOr(Schema.String),
        serves: Schema.Boolean,
        label: Schema.String,
      }),
    ),
    host: Schema.NullOr(Schema.String),
    reachable: Schema.Boolean,
    moving: Schema.NullOr(Schema.String),
    error: Schema.NullOr(Schema.String),
  }),
  at: Millis,
}).annotate({
  description:
    "service/web.json: what the service last said about the web app (service/main.ts tailnet, serveNow).",
});

export const SentFile = Schema.Record(
  Schema.String,
  Schema.Struct({
    at: Millis,
    result: Schema.Struct({ ok: Schema.Literal(true), at: Millis }),
  }),
).annotate({
  description:
    "service/sent.json: a page's sends of the last hour, so a retry gets the same answer (service/send-once.ts). The file itself is the map: open by the page's own send id. Only a send that went in is kept, so its answer is always this one shape (service/actions.ts sendNow).",
});

const UsageId = Schema.String.check(
  Schema.isPattern(/^[\w.:@#/+=-]{1,120}$/),
).annotate({
  description: "core/usage.js ID: an id, a kind or a key, never words.",
});
const count = (maximum: number) =>
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum }));

export const UsageLine = Schema.Struct({
  at: Millis,
  kind: Schema.Literals(["view", "act", "send", "feature", "error", "ask"]),
  from: optional(
    Schema.Literals(["web", "phone", "window", "voice", "terminal"]),
  ),
  view: optional(UsageId),
  space: optional(UsageId),
  task: optional(UsageId),
  tab: optional(UsageId),
  artifact: optional(UsageId),
  section: optional(UsageId),
  type: optional(UsageId),
  key: optional(UsageId),
  ms: optional(count(86_400_000)),
  n: optional(count(100_000)),
  status: optional(count(999)),
}).annotate({
  description:
    "One line of service/usage.jsonl: an event as core/usage.js clean keeps it.",
});
