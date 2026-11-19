import { Context, Data, Effect, Layer } from "effect";
import { type NotBuilt, notBuilt } from "../not-built.ts";

interface DeploymentTarget {
  readonly agentCli: "claude" | "codex";
  readonly target: string;
  readonly subscription?: string;
}

export interface Deployment {
  readonly name: string;
  readonly model: string;
  readonly version?: string;
}

class ModelProviderSignInRequired extends Data.TaggedError(
  "ModelProviderSignInRequired",
)<{ readonly modelProvider: "azure" }> {}

class DeploymentTargetNotFound extends Data.TaggedError(
  "DeploymentTargetNotFound",
)<{ readonly target: string }> {}

interface ModelProvidersShape {
  readonly azure: {
    readonly listDeployments: (
      target: DeploymentTarget,
    ) => Effect.Effect<
      ReadonlyArray<Deployment>,
      ModelProviderSignInRequired | DeploymentTargetNotFound | NotBuilt
    >;
  };
}

export interface ModelProvidersTestScript {
  readonly signedOut?: boolean;
  readonly deployments?: Readonly<Record<string, ReadonlyArray<Deployment>>>;
}

export class ModelProviders extends Context.Service<
  ModelProviders,
  ModelProvidersShape
>()("ModelProviders") {
  static readonly layer = Layer.succeed(ModelProviders, {
    azure: {
      listDeployments: () =>
        notBuilt("ModelProviders", "azure.listDeployments"),
    },
  });

  static layerTestWith(
    script: ModelProvidersTestScript,
  ): Layer.Layer<ModelProviders> {
    return Layer.succeed(ModelProviders, {
      azure: {
        listDeployments: ({ agentCli, target }) => {
          if (script.signedOut === true)
            return Effect.fail(
              new ModelProviderSignInRequired({ modelProvider: "azure" }),
            );
          const found = script.deployments?.[`${agentCli}:${target}`];
          return found === undefined
            ? Effect.fail(new DeploymentTargetNotFound({ target }))
            : Effect.succeed(found);
        },
      },
    });
  }

  static readonly layerTest = ModelProviders.layerTestWith({});
}
