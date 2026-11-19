import { Data, Effect } from "effect";

export class NotBuilt extends Data.TaggedError("NotBuilt")<{
  readonly seam: string;
  readonly entry: string;
}> {}

export function notBuilt(
  seam: string,
  entry: string,
): Effect.Effect<never, NotBuilt> {
  return Effect.fail(new NotBuilt({ seam, entry }));
}
