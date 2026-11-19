import { Context, Layer } from "effect";
import { notBuilt } from "../not-built.ts";
import type { ForgeShape, MergingForge } from "./forge.ts";
import { type ForgeTestScript, forgeInMemory } from "./forge-test-layer.ts";

const seam = "GitHubForge";

export class GitHubForge extends Context.Service<
  GitHubForge,
  ForgeShape<"github", "open"> & MergingForge
>()("GitHubForge") {
  static readonly layer = Layer.succeed(GitHubForge, {
    readPullRequest: () => notBuilt(seam, "readPullRequest"),
    publishStage: () => notBuilt(seam, "publishStage"),
    observeStage: () => notBuilt(seam, "observeStage"),
    merge: () => notBuilt(seam, "merge"),
  });

  static layerTestWith(script: ForgeTestScript): Layer.Layer<GitHubForge> {
    return Layer.effect(GitHubForge, forgeInMemory("github", script));
  }

  static readonly layerTest = GitHubForge.layerTestWith({});
}
