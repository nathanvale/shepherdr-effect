import { Schema } from "effect";

const optional = Schema.optionalKey;

export const maxFrameBytes = 16 * 1024 * 1024;

export const HelloParams = Schema.Struct({
  generation: Schema.Literal(1),
  framed: Schema.Literal(true),
});

export const HelloReply = Schema.Struct({
  version: Schema.String,
  generation: Schema.Int,
  framed: Schema.Boolean,
  core: Schema.Struct({ id: Schema.String, name: Schema.String }),
  methods: Schema.Array(Schema.String),
  features: Schema.Array(Schema.String),
});

export const RpcRequest = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Int,
  method: Schema.String,
  params: Schema.Record(Schema.String, Schema.Unknown),
});

export const RpcReply = Schema.Union([
  Schema.Struct({
    jsonrpc: optional(Schema.Literal("2.0")),
    id: Schema.Int,
    result: Schema.Unknown,
  }),
  Schema.Struct({
    jsonrpc: optional(Schema.Literal("2.0")),
    id: Schema.Int,
    error: Schema.Struct({
      message: Schema.String,
      data: optional(
        Schema.Struct({
          kind: optional(Schema.String),
          hint: optional(Schema.String),
        }),
      ),
    }),
  }),
]);

export const TerminalRecord = Schema.Struct({
  address: Schema.String,
  name: optional(Schema.NullOr(Schema.String)),
  parent: optional(Schema.NullOr(Schema.String)),
  labels: Schema.Record(Schema.String, Schema.String),
  argv: Schema.Array(Schema.String),
  cwd: Schema.String,
  state: Schema.String,
  status: optional(
    Schema.NullOr(
      Schema.Struct({
        state: Schema.String,
        kind: optional(Schema.String),
        progress: optional(Schema.Number),
        app: optional(Schema.String),
        title: optional(Schema.String),
        msg: optional(Schema.String),
      }),
    ),
  ),
  reported: optional(Schema.Boolean),
  turn: optional(Schema.Int),
  pid: optional(Schema.NullOr(Schema.Int)),
  reason: optional(Schema.NullOr(Schema.String)),
  exit_code: optional(Schema.NullOr(Schema.Int)),
  signal: optional(Schema.NullOr(Schema.Int)),
  created_ms: Schema.Int,
  status_ms: optional(Schema.NullOr(Schema.Int)),
  cols: Schema.Int,
  rows: Schema.Int,
});

export const EventsSnapshot = Schema.Struct({
  seq: Schema.Int,
  terminals: Schema.Array(TerminalRecord),
  channel: optional(Schema.Int),
});

export const RpcNotification = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.Literals(["event", "heartbeat", "missed"]),
  params: Schema.Struct({
    seq: Schema.Int,
    type: optional(Schema.String),
    terminal: optional(Schema.String),
    machine: optional(Schema.String),
    data: optional(Schema.Record(Schema.String, Schema.Unknown)),
    terminals: optional(Schema.Array(TerminalRecord)),
  }),
});

export const SharedDocumentReply = Schema.Struct({
  value: Schema.Unknown,
  version: Schema.Int,
});

export const SharedDocumentSetParams = Schema.Struct({
  name: Schema.String,
  value: Schema.Unknown,
  version: Schema.Int,
  on: optional(Schema.String),
});

export const MachineExecParams = Schema.Struct({
  argv: Schema.Array(Schema.String),
  on: optional(Schema.String),
  cwd: optional(Schema.String),
  input: optional(Schema.String),
  timeout: optional(Schema.Number),
});

export const MachineExecReply = Schema.Struct({
  code: Schema.Int,
  stdout: Schema.String,
  stderr: Schema.String,
  truncated: optional(Schema.Boolean),
});

export const MachineListReply = Schema.Struct({
  machines: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      id: Schema.String,
      state: Schema.String,
    }),
  ),
});
