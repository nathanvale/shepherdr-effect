import { Context, Data, Effect, Layer, Ref } from "effect";
import { type NotBuilt, notBuilt } from "../not-built.ts";

interface TailnetView {
  readonly tailnetOwner: string;
  readonly dnsName: string;
  readonly link: string | null;
}

class TailnetNotRunning extends Data.TaggedError("TailnetNotRunning")<{
  readonly entry: string;
}> {}

class FunnelRefused extends Data.TaggedError("FunnelRefused")<{
  readonly reason: "a funnel is on, and the web app is never funnelled";
}> {}

class TailnetPortHeld extends Data.TaggedError("TailnetPortHeld")<{
  readonly heldBy: string;
}> {}

interface TailnetShape {
  readonly whoAmI: Effect.Effect<TailnetView, TailnetNotRunning | NotBuilt>;
  readonly share: (
    port: number,
  ) => Effect.Effect<
    string,
    TailnetNotRunning | FunnelRefused | TailnetPortHeld | NotBuilt
  >;
  readonly unshare: Effect.Effect<void, TailnetNotRunning | NotBuilt>;
}

export interface TailnetTestScript {
  readonly owner?: { readonly tailnetOwner: string; readonly dnsName: string };
  readonly funnelOn?: boolean;
  readonly heldBy?: string;
}

const seam = "Tailnet";

export class Tailnet extends Context.Service<Tailnet, TailnetShape>()(
  "Tailnet",
) {
  static readonly layer = Layer.succeed(Tailnet, {
    whoAmI: notBuilt(seam, "whoAmI"),
    share: () => notBuilt(seam, "share"),
    unshare: notBuilt(seam, "unshare"),
  });

  static layerTestWith(script: TailnetTestScript): Layer.Layer<Tailnet> {
    return Layer.effect(
      Tailnet,
      Effect.gen(function* () {
        const shared = yield* Ref.make<number | null>(null);
        const running = (entry: string) =>
          script.owner === undefined
            ? Effect.fail(new TailnetNotRunning({ entry }))
            : Effect.succeed(script.owner);
        const linkOf = (dnsName: string) => `https://${dnsName}/shepherdr/`;
        return {
          whoAmI: Effect.gen(function* () {
            const owner = yield* running("whoAmI");
            const port = yield* Ref.get(shared);
            return {
              ...owner,
              link: port === null ? null : linkOf(owner.dnsName),
            };
          }),
          share: (port) =>
            Effect.gen(function* () {
              const { dnsName } = yield* running("share");
              if (script.funnelOn === true)
                return yield* new FunnelRefused({
                  reason: "a funnel is on, and the web app is never funnelled",
                });
              if (script.heldBy !== undefined)
                return yield* new TailnetPortHeld({ heldBy: script.heldBy });
              yield* Ref.set(shared, port);
              return linkOf(dnsName);
            }),
          unshare: Effect.andThen(running("unshare"), Ref.set(shared, null)),
        };
      }),
    );
  }

  static readonly layerTest = Tailnet.layerTestWith({});
}
