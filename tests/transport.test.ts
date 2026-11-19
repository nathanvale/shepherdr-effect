import { expect, test } from "bun:test";
import { Effect, Schema, Stream } from "effect";
import {
  type RequestFacts,
  Transport,
  type TransportHandlers,
  type TransportTestScript,
  TransportTestWebApp,
} from "../src/adapters/transport/index.ts";
import * as messages from "../src/adapters/transport/messages.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const fromOwner: RequestFacts = {
  method: "POST",
  path: "/api/action",
  host: "mini.tail1234.ts.net",
  origin: "https://mini.tail1234.ts.net",
  tailnetLogin: "nathan@example.com",
  bearer: null,
  marked: true,
  upgrade: false,
};

function handlersRecording(handled: unknown[]): TransportHandlers {
  return {
    admitRequest: (facts) =>
      facts.tailnetLogin === "nathan@example.com"
        ? { admitted: true, who: facts.tailnetLogin }
        : { admitted: false, status: 403, why: "only this machine's owner" },
    handle: (who, facts, body) =>
      Effect.sync(() => {
        handled.push({ who, path: facts.path, upgrade: facts.upgrade, body });
        return { status: 200, body: { ok: true } };
      }),
  };
}

function onTestTransport<A, E>(
  program: Effect.Effect<A, E, Transport | TransportTestWebApp>,
  script?: TransportTestScript,
): Promise<A> {
  const layer =
    script === undefined
      ? Transport.layerTest
      : Transport.layerTestWith(script);
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

test("request admission runs before every handler, for a request and for an upgrade", async () => {
  const handled: unknown[] = [];
  const replies = await onTestTransport(
    Effect.scoped(
      Effect.gen(function* () {
        const webApp = yield* TransportTestWebApp;
        yield* (yield* Transport).serve(handlersRecording(handled));
        const stranger = { ...fromOwner, tailnetLogin: "someone@example.com" };
        return [
          yield* webApp.request(fromOwner, { type: "stop" }),
          yield* webApp.request(stranger, { type: "stop" }),
          yield* webApp.request(
            { ...stranger, path: "/api/ws", upgrade: true },
            null,
          ),
          yield* webApp.request(
            { ...fromOwner, path: "/api/ws", upgrade: true },
            null,
          ),
        ];
      }),
    ),
  );

  const refused = { status: 403, body: "only this machine's owner" };
  expect(replies).toEqual([
    { status: 200, body: { ok: true } },
    refused,
    refused,
    { status: 200, body: { ok: true } },
  ]);
  expect(handled).toEqual([
    {
      who: "nathan@example.com",
      path: "/api/action",
      upgrade: false,
      body: { type: "stop" },
    },
    { who: "nathan@example.com", path: "/api/ws", upgrade: true, body: null },
  ]);
});

test("one service role serves at a time, and the daemon lock is given back when its scope closes", async () => {
  const seen = await onTestTransport(
    Effect.gen(function* () {
      const transport = yield* Transport;
      const webApp = yield* TransportTestWebApp;
      const handlers = handlersRecording([]);
      const second = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* transport.serve(handlers);
          return yield* Effect.flip(transport.serve(handlers));
        }),
      );
      const after = yield* webApp.request(fromOwner, null);
      const again = yield* Effect.scoped(
        Effect.andThen(
          transport.serve(handlers),
          webApp.request(fromOwner, null),
        ),
      );
      return { second: failureOf(second), after, again: again.status };
    }),
  );

  expect(seen).toEqual({
    second: { _tag: "DaemonLockHeld", heldBy: "this daemon" },
    after: { status: 503, body: "not serving" },
    again: 200,
  });
});

test("a daemon lock held by another process refuses to serve", async () => {
  const refusal = await onTestTransport(
    Effect.scoped(
      Effect.flatMap(Transport, (transport) =>
        Effect.flip(transport.serve(handlersRecording([]))),
      ),
    ),
    { daemonLockHeldBy: "pid 4242" },
  );

  expect(failureOf(refusal)).toEqual({
    _tag: "DaemonLockHeld",
    heldBy: "pid 4242",
  });
});

test("a published live message reaches the web app as the wire message", async () => {
  const published = await onTestTransport(
    Effect.gen(function* () {
      const transport = yield* Transport;
      yield* transport.publish({ type: "pong", at: 1_795_000_000_000 });
      yield* transport.publish({
        type: "view",
        name: "reach",
        value: { mini: 1 },
      });
      return yield* (yield* TransportTestWebApp).published;
    }),
  );

  const onTheWire = Schema.encodeSync(messages.LiveMessage);
  expect(published.map((message) => onTheWire(message))).toEqual([
    { type: "pong", at: 1_795_000_000_000 },
    { type: "view", name: "reach", value: { mini: 1 } },
  ]);
});

test("a terminal stream reaches its page in order, and a page that has gone is said so", async () => {
  const bytesOf = (text: string) => new TextEncoder().encode(text);
  const seen = await onTestTransport(
    Effect.gen(function* () {
      const transport = yield* Transport;
      const output = Stream.make(bytesOf("$ "), bytesOf("ls\r\n"));
      yield* transport.streamTerminal("page-1", output);
      const gone = yield* Effect.flip(
        transport.streamTerminal("page-9", output),
      );
      const webApp = yield* TransportTestWebApp;
      const decoder = new TextDecoder();
      return {
        reached: (yield* webApp.terminalBytes("page-1")).map((bytes) =>
          decoder.decode(bytes),
        ),
        other: yield* webApp.terminalBytes("page-9"),
        gone: failureOf(gone),
      };
    }),
    { pages: ["page-1"] },
  );

  expect(seen).toEqual({
    reached: ["$ ", "ls\r\n"],
    other: [],
    gone: { _tag: "PageGone", page: "page-9" },
  });
});

const wireSamples = [
  [
    messages.LiveMessage,
    {
      type: "hello",
      version: "3.1.35",
      login: "local",
      machine: null,
      link: null,
    },
  ],
  [messages.LiveMessage, { type: "snapshot", snapshot: { tasks: [] } }],
  [messages.PageMessage, { type: "ping", at: 12 }],
  [
    messages.PageMessage,
    { type: "watch", chats: ["shepherdr#4"], visible: true },
  ],
  [messages.TerminalPageMessage, { type: "open", id: 1 }],
  [messages.TerminalPageMessage, { type: "keys", id: 2, keys: ["enter"] }],
  [messages.TerminalServiceMessage, { type: "size", cols: 120, rows: 40 }],
  [
    messages.TerminalServiceMessage,
    { type: "ended", why: "the connection was lost" },
  ],
] as const;

test("each WebSocket message decodes whole, and a message of an unknown type does not", () => {
  const decoded = wireSamples.map(([schema, sample]) =>
    Schema.encodeUnknownSync(schema)(Schema.decodeUnknownSync(schema)(sample)),
  );
  const unknown = [
    messages.LiveMessage,
    messages.PageMessage,
    messages.TerminalPageMessage,
    messages.TerminalServiceMessage,
  ].map((schema) => Schema.is(schema)({ type: "gossip", id: 1 }));

  expect(decoded).toEqual(wireSamples.map(([, sample]) => sample));
  expect(unknown).toEqual([false, false, false, false]);
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    Effect.gen(function* () {
      const transport = yield* Transport;
      return yield* Effect.all([
        Effect.flip(Effect.scoped(transport.serve(handlersRecording([])))),
        Effect.flip(transport.publish({ type: "pong", at: null })),
        Effect.flip(transport.streamTerminal("page-1", Stream.empty)),
      ]);
    }).pipe(Effect.provide(Transport.layer)),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: Transport.serve",
    "NotBuilt: Transport.publish",
    "NotBuilt: Transport.streamTerminal",
  ]);
});
