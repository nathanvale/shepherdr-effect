import { Context, Data, Effect, Layer, Ref, Result, Schema } from "effect";
import { SettingsFile } from "../../state-files/settings.ts";
import { type NotBuilt, notBuilt } from "../not-built.ts";

export const SettingsDigest = Schema.String.pipe(
  Schema.brand("SettingsDigest"),
);
export type SettingsDigest = typeof SettingsDigest.Type;

export interface SettingsView {
  readonly settings: typeof SettingsFile.Type;
  readonly digest: SettingsDigest;
}

class SettingsUnreadable extends Data.TaggedError("SettingsUnreadable")<{
  readonly reason: string;
}> {}

class SettingsChanged extends Data.TaggedError("SettingsChanged")<{
  readonly digest: SettingsDigest;
}> {}

interface SettingsShape {
  readonly readStrict: Effect.Effect<
    SettingsView,
    SettingsUnreadable | NotBuilt
  >;
  readonly write: (
    settings: typeof SettingsFile.Type,
    readAt: SettingsDigest,
  ) => Effect.Effect<SettingsView, SettingsChanged | NotBuilt>;
}

export interface SettingsTestScript {
  readonly text?: string;
}

const SettingsText = Schema.fromJsonString(SettingsFile);

function digestOf(text: string | undefined): SettingsDigest {
  return SettingsDigest.make(
    new Bun.CryptoHasher("sha256").update(text ?? "").digest("hex"),
  );
}

function viewOf(
  text: string | undefined,
): Result.Result<SettingsView, SettingsUnreadable> {
  if (text === undefined)
    return Result.succeed({ settings: { version: 1 }, digest: digestOf(text) });
  const settings = Schema.decodeUnknownResult(SettingsText)(text);
  return Result.isSuccess(settings)
    ? Result.succeed({ settings: settings.success, digest: digestOf(text) })
    : Result.fail(
        new SettingsUnreadable({
          reason: "The settings file does not decode as a settings file.",
        }),
      );
}

type Text = string | undefined;

function writing(
  settings: typeof SettingsFile.Type,
  readAt: SettingsDigest,
): (
  text: Text,
) => readonly [Result.Result<SettingsView, SettingsChanged>, Text] {
  return (text) => {
    const digest = digestOf(text);
    if (digest !== readAt)
      return [Result.fail(new SettingsChanged({ digest })), text];
    const written = Schema.encodeSync(SettingsText)(settings);
    return [Result.succeed({ settings, digest: digestOf(written) }), written];
  };
}

const seam = "Settings";

export class Settings extends Context.Service<Settings, SettingsShape>()(
  "Settings",
) {
  static readonly layer = Layer.succeed(Settings, {
    readStrict: notBuilt(seam, "readStrict"),
    write: () => notBuilt(seam, "write"),
  });

  static layerTestWith(script: SettingsTestScript): Layer.Layer<Settings> {
    return Layer.effect(
      Settings,
      Effect.gen(function* () {
        const file = yield* Ref.make(script.text);
        return {
          readStrict: Ref.get(file).pipe(
            Effect.flatMap((text) => Effect.fromResult(viewOf(text))),
          ),
          write: (settings, readAt) =>
            Ref.modify(file, writing(settings, readAt)).pipe(
              Effect.flatMap((result) => Effect.fromResult(result)),
            ),
        };
      }),
    );
  }

  static readonly layerTest = Settings.layerTestWith({});
}
