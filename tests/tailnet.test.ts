import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  Tailnet,
  type TailnetTestScript,
} from "../src/adapters/tailnet/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const owner = {
  tailnetOwner: "nathan@example.com",
  dnsName: "mini.tail1234.ts.net",
};

function onTestTailnet<A, E>(
  program: Effect.Effect<A, E, Tailnet>,
  script: TailnetTestScript,
): Promise<A> {
  return Effect.runPromise(
    program.pipe(Effect.provide(Tailnet.layerTestWith(script))),
  );
}

const everyEntry = Effect.gen(function* () {
  const tailnet = yield* Tailnet;
  return yield* Effect.all([
    Effect.flip(tailnet.whoAmI),
    Effect.flip(tailnet.share(8787)),
    Effect.flip(tailnet.unshare),
  ]);
});

test("the web app is shared under /shepherdr for the tailnet owner, until it is unshared", async () => {
  const seen = await onTestTailnet(
    Effect.gen(function* () {
      const tailnet = yield* Tailnet;
      const before = yield* tailnet.whoAmI;
      const link = yield* tailnet.share(8787);
      const during = yield* tailnet.whoAmI;
      yield* tailnet.unshare;
      return { before, link, during, after: yield* tailnet.whoAmI };
    }),
    { owner },
  );

  const link = "https://mini.tail1234.ts.net/shepherdr/";
  expect(seen).toEqual({
    before: { ...owner, link: null },
    link,
    during: { ...owner, link },
    after: { ...owner, link: null },
  });
});

test("nothing is shared while a funnel is on, or while something else holds the port", async () => {
  const share = Effect.flatMap(Tailnet, (tailnet) =>
    Effect.gen(function* () {
      const refusal = yield* Effect.flip(tailnet.share(8787));
      return {
        refusal: failureOf(refusal),
        link: (yield* tailnet.whoAmI).link,
      };
    }),
  );
  const seen = [
    await onTestTailnet(share, { owner, funnelOn: true }),
    await onTestTailnet(share, { owner, heldBy: "another serve on 443" }),
  ];

  expect(seen).toEqual([
    {
      refusal: {
        _tag: "FunnelRefused",
        reason: "a funnel is on, and the web app is never funnelled",
      },
      link: null,
    },
    {
      refusal: { _tag: "TailnetPortHeld", heldBy: "another serve on 443" },
      link: null,
    },
  ]);
});

test("with Tailscale not running every entry says so, naming itself", async () => {
  const refusals = await Effect.runPromise(
    everyEntry.pipe(Effect.provide(Tailnet.layerTest)),
  );

  expect(refusals.map(failureOf)).toEqual([
    { _tag: "TailnetNotRunning", entry: "whoAmI" },
    { _tag: "TailnetNotRunning", entry: "share" },
    { _tag: "TailnetNotRunning", entry: "unshare" },
  ]);
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    everyEntry.pipe(Effect.provide(Tailnet.layer)),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: Tailnet.whoAmI",
    "NotBuilt: Tailnet.share",
    "NotBuilt: Tailnet.unshare",
  ]);
});
