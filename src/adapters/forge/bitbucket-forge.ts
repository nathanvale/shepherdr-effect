import { Context, Effect, Layer } from "effect";
import { notBuilt } from "../not-built.ts";
import type { ForgeShape } from "./forge.ts";
import { type ForgeTestScript, forgeInMemory } from "./forge-test-layer.ts";

const seam = "BitbucketForge";

export class BitbucketForge extends Context.Service<
  BitbucketForge,
  ForgeShape<"bitbucket", "draft" | "ready">
>()("BitbucketForge") {
  static readonly layer = Layer.succeed(BitbucketForge, {
    readPullRequest: () => notBuilt(seam, "readPullRequest"),
    publishStage: () => notBuilt(seam, "publishStage"),
    observeStage: () => notBuilt(seam, "observeStage"),
  });

  static layerTestWith(script: ForgeTestScript): Layer.Layer<BitbucketForge> {
    return Layer.effect(
      BitbucketForge,
      Effect.map(
        forgeInMemory("bitbucket", script),
        ({ readPullRequest, publishStage, observeStage }) => ({
          readPullRequest,
          publishStage,
          observeStage,
        }),
      ),
    );
  }

  static readonly layerTest = BitbucketForge.layerTestWith({});
}
