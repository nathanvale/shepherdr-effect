import { Effect, Layer, Stream } from "effect";
import {
  HerdrCore,
  type HerdrCoreTestScript,
  SendPermitMaker,
  type Terminal,
  TerminalAddress,
  type TerminalStart,
} from "../src/adapters/herdr-core/index.ts";
import type { AttemptId } from "../src/domains/attempt/index.ts";
import { attemptId } from "./attempt-fixtures.ts";

export const workerStart: TerminalStart = {
  argv: ["claude", "--model", "opus"],
  cwd: "/work/shepherdr",
  name: "HAT-4",
  labels: { "herdr.task": "shepherdr#4" },
  keep: true,
};

export const t1 = TerminalAddress.make("t1");
export const t9 = TerminalAddress.make("t9");

export function labelledFor(id: AttemptId, address: string): Terminal {
  return {
    ...workerStart,
    address: TerminalAddress.make(address),
    labels: { "herdr.launch": id },
  };
}

export function onTestLink<A, E>(
  program: Effect.Effect<A, E, HerdrCore | SendPermitMaker>,
  script?: HerdrCoreTestScript,
): Promise<A> {
  const link =
    script === undefined
      ? HerdrCore.layerTest
      : HerdrCore.layerTestWith(script);
  return Effect.runPromise(
    program.pipe(Effect.provide(Layer.merge(link, SendPermitMaker.layer))),
  );
}

export function permitFor(id: AttemptId) {
  return Effect.map(SendPermitMaker, (maker) =>
    maker.make({ _tag: "Uncertain", id }),
  );
}

export const started = Effect.gen(function* () {
  const link = yield* HerdrCore;
  return yield* link.startTerminal(yield* permitFor(attemptId), workerStart);
});

export const everyEntryRefusal = Effect.gen(function* () {
  const link = yield* HerdrCore;
  const document = { name: "shepherdr", value: null, version: 0 };
  return yield* Effect.all([
    Effect.flip(started),
    Effect.flip(link.listTerminals()),
    Effect.flip(link.readScreen(t1)),
    Effect.flip(link.labelTerminal(t1, {})),
    Effect.flip(link.typeInto(t1, { _tag: "Interrupt" })),
    Effect.flip(link.killTerminal(t1)),
    Effect.flip(Stream.runCollect(link.watchTerminal(t1))),
    Effect.flip(Stream.runCollect(link.events)),
    Effect.flip(link.readSharedDocument("shepherdr")),
    Effect.flip(link.updateSharedDocument(document)),
    Effect.flip(link.execOnMachine({ machine: "local", argv: ["uname"] })),
    Effect.flip(
      link.writeFileOnMachine("local", "install/x", new Uint8Array()),
    ),
    Effect.flip(link.listMachines),
    Effect.flip(link.observeLaunch(attemptId)),
  ]);
});

export const entries = [
  "startTerminal",
  "listTerminals",
  "readScreen",
  "labelTerminal",
  "typeInto",
  "killTerminal",
  "watchTerminal",
  "events",
  "readSharedDocument",
  "updateSharedDocument",
  "execOnMachine",
  "writeFileOnMachine",
  "listMachines",
  "observeLaunch",
] as const;
