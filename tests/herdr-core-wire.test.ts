import { expect, test } from "bun:test";
import { Result, Schema } from "effect";
import * as wire from "../src/adapters/herdr-core/wire.ts";

const terminal = {
  address: "t50",
  name: "HAT-4",
  parent: null,
  labels: { "herdr.task": "shepherdr#4", "herdr.launch": "6f1d2c3a" },
  argv: ["claude"],
  cwd: "work/shepherdr",
  state: "running",
  status: { state: "working", kind: "agent", title: "HAT-4" },
  turn: 3,
  pid: 4242,
  created_ms: 1_795_000_000_000,
  status_ms: null,
  cols: 120,
  rows: 40,
};

const samples = [
  ["hello params", wire.HelloParams, { generation: 1, framed: true }],
  [
    "hello reply",
    wire.HelloReply,
    {
      version: "0.1.14",
      generation: 1,
      framed: true,
      core: { id: "c1", name: "mini" },
      methods: ["terminal.run", "doc.get"],
      features: [],
    },
  ],
  [
    "request",
    wire.RpcRequest,
    {
      jsonrpc: "2.0",
      id: 7,
      method: "terminal.send",
      params: { terminal: "t50", text: "hello" },
    },
  ],
  ["reply", wire.RpcReply, { jsonrpc: "2.0", id: 7, result: { ok: true } }],
  [
    "refusing reply",
    wire.RpcReply,
    {
      id: 7,
      error: { message: "no such terminal", data: { kind: "not_found" } },
    },
  ],
  ["terminal record", wire.TerminalRecord, terminal],
  ["events snapshot", wire.EventsSnapshot, { seq: 12, terminals: [terminal] }],
  [
    "notification",
    wire.RpcNotification,
    {
      jsonrpc: "2.0",
      method: "event",
      params: { seq: 13, type: "labels", terminal: "t50", data: {} },
    },
  ],
  [
    "shared document reply",
    wire.SharedDocumentReply,
    { value: { serving: true }, version: 4 },
  ],
  [
    "shared document write",
    wire.SharedDocumentSetParams,
    { name: "shepherdr.host", value: { at: 1 }, version: 4, on: "mini" },
  ],
  [
    "machine command",
    wire.MachineExecParams,
    { argv: ["uname", "-sm"], on: "mini", timeout: 10 },
  ],
  [
    "machine command reply",
    wire.MachineExecReply,
    { code: 0, stdout: "Linux aarch64\n", stderr: "" },
  ],
  [
    "machine list reply",
    wire.MachineListReply,
    { machines: [{ name: "mini", id: "c2", state: "connected" }] },
  ],
] as const;

test("thirteen wire samples are listed, one for each message the link hides", () => {
  expect(samples.map(([name]) => name)).toHaveLength(13);
});

for (const [name, schema, sample] of samples)
  test(`a ${name} decodes whole and encodes back as it arrived`, () => {
    const decoded = Schema.decodeUnknownSync(schema)(sample);

    expect(Schema.encodeUnknownSync(schema)(decoded)).toEqual(sample);
  });

const refused = [
  ["another generation", wire.HelloParams, { generation: 2, framed: true }],
  [
    "a notification of an unknown kind",
    wire.RpcNotification,
    { jsonrpc: "2.0", method: "gossip", params: { seq: 1 } },
  ],
  ["a reply with no id", wire.RpcReply, { jsonrpc: "2.0", result: {} }],
  [
    "a terminal record without labels",
    wire.TerminalRecord,
    { ...terminal, labels: undefined },
  ],
  [
    "a machine command reply without an exit code",
    wire.MachineExecReply,
    { stdout: "", stderr: "" },
  ],
] as const;

for (const [name, schema, sample] of refused)
  test(`${name} does not decode`, () => {
    const decoded = Schema.decodeUnknownResult(schema)(sample);

    expect(Result.isFailure(decoded)).toBe(true);
  });

test("a frame is capped at 16 MiB", () => {
  expect(wire.maxFrameBytes).toBe(16_777_216);
});
