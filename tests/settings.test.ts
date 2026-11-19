import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  Settings,
  SettingsDigest,
  type SettingsTestScript,
  type SettingsView,
} from "../src/adapters/settings/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const azureText =
  '{"version":1,"everywhere":{"provider":{"route":"azure-foundry"}}}';
const azure: SettingsView["settings"] = {
  version: 1,
  everywhere: { provider: { route: "azure-foundry" } },
};
const digestOfNoFile = SettingsDigest.make(
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
);
const digestOfAzureText = SettingsDigest.make(
  "f22c705e508f82a291ca036f0edec44fd5d6281a3661c4dc2d664aa9e27a33e4",
);

function onTestSettings<A, E>(
  program: Effect.Effect<A, E, Settings>,
  script?: SettingsTestScript,
): Promise<A> {
  const layer =
    script === undefined ? Settings.layerTest : Settings.layerTestWith(script);
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

const read = Effect.flatMap(Settings, (settings) => settings.readStrict);
const onNothing = read.pipe(Effect.provide(Settings.layerTest));

test("a missing settings file reads as settings that set nothing, which is Personal", async () => {
  const view = await onTestSettings(read);

  expect(view).toEqual({ settings: { version: 1 }, digest: digestOfNoFile });
});

test("a settings file reads as its settings and the digest of its bytes", async () => {
  const view = await onTestSettings(read, { text: azureText });

  expect(view).toEqual({
    settings: azure,
    digest: digestOfAzureText,
  });
});

for (const [name, text] of [
  ["cut short", '{"version":1,"everywhere":'],
  ["of another version", '{"version":2}'],
  ["empty", ""],
] as const)
  test(`a settings file that is ${name} refuses and is never read as Personal`, async () => {
    const refusal = await onTestSettings(Effect.flip(read), { text });

    expect(failureOf(refusal)).toEqual({
      _tag: "SettingsUnreadable",
      reason: "The settings file does not decode as a settings file.",
    });
  });

test("a write lands only on the digest that was read, so a writer in between is not overwritten", async () => {
  const seen = await onTestSettings(
    Effect.gen(function* () {
      const settings = yield* Settings;
      const before = yield* settings.readStrict;
      const written = yield* settings.write(azure, before.digest);
      const stale = yield* Effect.flip(
        settings.write({ version: 1 }, before.digest),
      );
      const after = yield* settings.readStrict;
      return {
        written: written.settings,
        sameDigest: written.digest === after.digest,
        stale: failureOf(stale).digest === after.digest,
        staleTag: stale._tag,
        after: after.settings,
      };
    }),
  );

  expect(seen).toEqual({
    written: azure,
    sameDigest: true,
    stale: true,
    staleTag: "SettingsChanged",
    after: azure,
  });
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    Effect.gen(function* () {
      const settings = yield* Settings;
      return yield* Effect.all([
        Effect.flip(settings.readStrict),
        Effect.flip(
          Effect.flatMap(onNothing, ({ digest }) =>
            settings.write({ version: 1 }, digest),
          ),
        ),
      ]);
    }).pipe(Effect.provide(Settings.layer)),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: Settings.readStrict",
    "NotBuilt: Settings.write",
  ]);
});
