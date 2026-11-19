import { expect, test } from "bun:test";
import { Effect, type Layer } from "effect";
import {
  ModelProviders,
  type ModelProvidersTestScript,
} from "../src/adapters/model-providers/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const script: ModelProvidersTestScript = {
  deployments: {
    "claude:shepherdr-foundry": [
      { name: "opus-eastus2", model: "claude-opus-4-5", version: "20251101" },
      { name: "sonnet-eastus2", model: "claude-sonnet-4-5" },
    ],
  },
};
const target = { agentCli: "claude", target: "shepherdr-foundry" } as const;

function listed(
  wanted: { readonly agentCli: "claude" | "codex"; readonly target: string },
  layer: Layer.Layer<ModelProviders>,
) {
  return Effect.runPromise(
    Effect.flatMap(ModelProviders, (providers) =>
      providers.azure.listDeployments(wanted),
    ).pipe(Effect.result, Effect.provide(layer)),
  );
}

async function refusalOf(
  wanted: Parameters<typeof listed>[0],
  layer: Layer.Layer<ModelProviders>,
) {
  const result = await listed(wanted, layer);
  return result._tag === "Failure" ? result.failure : "it answered";
}

test("Azure answers the deployments of a target for one agent CLI", async () => {
  const result = await listed(target, ModelProviders.layerTestWith(script));

  expect(result._tag === "Success" ? result.success : "it failed").toEqual([
    { name: "opus-eastus2", model: "claude-opus-4-5", version: "20251101" },
    { name: "sonnet-eastus2", model: "claude-sonnet-4-5" },
  ]);
});

test("a target nobody deployed for that agent CLI is not found, and a signed-out account must sign in", async () => {
  const refusals = [
    await refusalOf(
      { ...target, agentCli: "codex" },
      ModelProviders.layerTestWith(script),
    ),
    await refusalOf(target, ModelProviders.layerTest),
    await refusalOf(
      target,
      ModelProviders.layerTestWith({ ...script, signedOut: true }),
    ),
  ];

  const notFound = {
    _tag: "DeploymentTargetNotFound",
    target: "shepherdr-foundry",
  };
  expect(
    refusals.map((refusal) =>
      typeof refusal === "string" ? refusal : failureOf(refusal),
    ),
  ).toEqual([
    notFound,
    notFound,
    { _tag: "ModelProviderSignInRequired", modelProvider: "azure" },
  ]);
});

test("the real layer answers NotBuilt for its one entry, naming it", async () => {
  const unbuilt = await refusalOf(target, ModelProviders.layer);

  expect(unbuiltEntryOf(unbuilt)).toBe(
    "NotBuilt: ModelProviders.azure.listDeployments",
  );
});
