import { expect, test } from "bun:test";
import { Effect, type Layer } from "effect";
import {
  CallerResolver,
  type CallerResolverTestScript,
} from "../src/adapters/caller/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const resolved = Effect.flatMap(CallerResolver, (resolver) => resolver.resolve);

function on<A, E>(
  program: Effect.Effect<A, E, CallerResolver>,
  layer: Layer.Layer<CallerResolver>,
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

test("with nothing scripted the caller is the person", async () => {
  expect(await on(resolved, CallerResolver.layerTest)).toBe("person");
});

for (const caller of ["assistant", "worker", "reviewer", "scheduler"] as const)
  test(`a scripted ${caller} is the caller`, async () => {
    const script: CallerResolverTestScript = { caller };

    expect(await on(resolved, CallerResolver.layerTestWith(script))).toBe(
      caller,
    );
  });

test("a caller that cannot be told is a refusal, never the person", async () => {
  const refusal = await on(
    Effect.flip(resolved),
    CallerResolver.layerTestWith({
      unresolved: "the terminal carries a worker label and a reviewer label",
    }),
  );

  expect(failureOf(refusal)).toEqual({
    _tag: "CallerUnresolved",
    reason: "the terminal carries a worker label and a reviewer label",
  });
});

test("the real layer answers NotBuilt for its one entry, naming it", async () => {
  const unbuilt = await on(Effect.flip(resolved), CallerResolver.layer);

  expect(unbuiltEntryOf(unbuilt)).toBe("NotBuilt: CallerResolver.resolve");
});
