import { Effect } from "effect";
import { NotBuilt } from "../src/adapters/not-built.ts";

export function unbuiltEntryOf(error: unknown): string {
  return error instanceof NotBuilt
    ? `NotBuilt: ${error.seam}.${error.entry}`
    : `not NotBuilt: ${String(error)}`;
}

export function failureOf(error: {
  readonly _tag: string;
}): Record<string, unknown> {
  return { ...error, _tag: error._tag };
}

export function refusedWith<A, E extends { readonly _tag: string }, R>(
  entry: Effect.Effect<A, E, R>,
): Effect.Effect<Record<string, unknown> | "not refused", never, R> {
  return Effect.match(entry, {
    onFailure: failureOf,
    onSuccess: () => "not refused" as const,
  });
}
