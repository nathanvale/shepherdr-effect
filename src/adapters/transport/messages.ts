import { Schema } from "effect";

const optional = Schema.optionalKey;

export const LiveMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("hello"),
    version: Schema.String,
    login: Schema.String,
    machine: Schema.NullOr(Schema.String),
    link: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("view"),
    name: Schema.String,
    value: Schema.Unknown,
  }),
  Schema.Struct({ type: Schema.Literal("snapshot"), snapshot: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("chat"), chat: Schema.Unknown }),
  Schema.Struct({
    type: Schema.Literal("pong"),
    at: Schema.NullOr(Schema.Number),
  }),
  Schema.Struct({ type: Schema.Literal("show"), artifact: Schema.Unknown }),
]);
export type LiveMessage = typeof LiveMessage.Type;

export const PageMessage = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ping"), at: optional(Schema.Number) }),
  Schema.Struct({
    type: Schema.Literal("watch"),
    chats: Schema.Array(Schema.String),
    push: optional(Schema.NullOr(Schema.String)),
    visible: optional(Schema.Boolean),
  }),
]);

export const TerminalPageMessage = Schema.Union([
  Schema.Struct({ type: Schema.Literal("open"), id: Schema.Int }),
  Schema.Struct({
    type: Schema.Literal("text"),
    id: Schema.Int,
    text: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("keys"),
    id: Schema.Int,
    keys: Schema.Array(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("resize"), id: Schema.Int }),
]);

export const TerminalServiceMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("size"),
    cols: Schema.Int,
    rows: Schema.Int,
  }),
  Schema.Struct({ type: Schema.Literal("ack"), id: Schema.Int }),
  Schema.Struct({ type: Schema.Literal("ended"), why: Schema.String }),
]);
