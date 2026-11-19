import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { CliKernelJournal } from "../src/adapters/cli-kernel/index.ts";
import {
  HerdrCore,
  type HerdrCoreTestScript,
  observeStartReply,
  type SendPermit,
  SendPermitMaker,
} from "../src/adapters/herdr-core/index.ts";
import type { Attempt } from "../src/domains/attempt/index.ts";
import { attemptId } from "./attempt-fixtures.ts";
import { lookalikePermit, workerStart } from "./herdr-core-fixtures.ts";
import { utilityLaunch } from "./kernel-journal-fixtures.ts";

type Uncertain = Extract<Attempt, { readonly _tag: "Uncertain" }>;

function terminalEffectAfter(
  script: HerdrCoreTestScript,
  permitOf: (
    maker: SendPermitMaker["Service"],
    uncertain: Uncertain,
  ) => SendPermit,
): Promise<Attempt> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const journal = yield* CliKernelJournal;
      const link = yield* HerdrCore;
      const maker = yield* SendPermitMaker;
      yield* journal.begin(utilityLaunch(attemptId, "scheduler:local"));
      return yield* journal.record({
        attemptId,
        effectId: "terminal",
        perform: (uncertain) =>
          link.startTerminal(permitOf(maker, uncertain), workerStart),
        observe: (reply) => Effect.succeed(observeStartReply(attemptId, reply)),
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          CliKernelJournal.layerTest,
          HerdrCore.layerTestWith(script),
          SendPermitMaker.layer,
        ),
      ),
    ),
  );
}

const made = (maker: SendPermitMaker["Service"], uncertain: Uncertain) =>
  maker.make(uncertain);

test("a start whose reply carries the terminal's address leaves the launch Confirmed", async () => {
  expect(await terminalEffectAfter({}, made)).toEqual({
    _tag: "Confirmed",
    id: attemptId,
    evidence: { _tag: "PositiveEvidence", attemptId, result: "t1" },
  });
});

test("a start the link never sent leaves the launch Refuted", async () => {
  expect(await terminalEffectAfter({ linkLost: true }, made)).toEqual({
    _tag: "Refuted",
    id: attemptId,
    evidence: {
      _tag: "RefutingEvidence",
      attemptId,
      reason: "the link was lost before the request was sent",
    },
  });
});

test("a start whose send permit the link refused leaves the launch Refuted", async () => {
  const refused = await terminalEffectAfter({}, () =>
    lookalikePermit(attemptId),
  );

  expect(refused).toEqual({
    _tag: "Refuted",
    id: attemptId,
    evidence: {
      _tag: "RefutingEvidence",
      attemptId,
      reason: "the send permit was refused, so no request was made",
    },
  });
});

for (const startReply of ["lost-after-start", "lost-before-start"] as const)
  test(`a start that was sent and whose reply is ${startReply} leaves the launch Uncertain`, async () => {
    expect(await terminalEffectAfter({ startReply }, made)).toEqual({
      _tag: "Uncertain",
      id: attemptId,
    });
  });
