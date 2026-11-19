import { Context, Data, Effect, Layer } from "effect";
import type { Caller } from "../../domains/task/index.ts";
import { type NotBuilt, notBuilt } from "../not-built.ts";

class CallerUnresolved extends Data.TaggedError("CallerUnresolved")<{
  readonly reason: string;
}> {}

interface CallerResolverShape {
  readonly resolve: Effect.Effect<Caller, CallerUnresolved | NotBuilt>;
}

export type CallerResolverTestScript =
  | { readonly caller: Caller }
  | { readonly unresolved: string };

function scripted(
  script: CallerResolverTestScript,
): Effect.Effect<Caller, CallerUnresolved> {
  return "caller" in script
    ? Effect.succeed(script.caller)
    : Effect.fail(new CallerUnresolved({ reason: script.unresolved }));
}

export class CallerResolver extends Context.Service<
  CallerResolver,
  CallerResolverShape
>()("CallerResolver") {
  static readonly layer = Layer.succeed(CallerResolver, {
    resolve: notBuilt("CallerResolver", "resolve"),
  });

  static layerTestWith(
    script: CallerResolverTestScript,
  ): Layer.Layer<CallerResolver> {
    return Layer.succeed(CallerResolver, { resolve: scripted(script) });
  }

  static readonly layerTest = CallerResolver.layerTestWith({
    caller: "person",
  });
}
