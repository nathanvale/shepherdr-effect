import { Schema } from "effect";
import {
  byId,
  itemFields,
  matchesIn,
  place,
  type SourceFile,
} from "./source.ts";

/** `id` is the label's name. One that ends in `.*` is a prefix: the code adds a name after it. */
export const TerminalLabel = Schema.Struct({
  ...itemFields("terminal-label"),
  /** Every file that names it, as a path from the fork root. */
  files: Schema.Array(Schema.String),
});
export type TerminalLabel = (typeof TerminalLabel)["Type"];

// A label is written at the start of a string: "herdr.task", f"herdr.space={id}",
// `herdr.chat=${pane}`. The quote before it keeps out "shepherdr.host" and
// "https://herdr.dev". A final dot marks a prefix ("herdr.secret.ask.").
const LABEL = /["'`](herdr\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)(\.?)/g;

/** Every distinct `herdr.<name>` terminal label the given files write as a string. */
export function terminalLabels(files: readonly SourceFile[]): TerminalLabel[] {
  const found = new Map<string, { source: string; files: Set<string> }>();
  for (const file of files)
    for (const { match, line } of matchesIn(file, LABEL)) {
      const id = `${match[1] ?? ""}${match[2] === "." ? ".*" : ""}`;
      const entry = found.get(id) ?? {
        source: place(file.path, line),
        files: new Set<string>(),
      };
      entry.files.add(file.path);
      found.set(id, entry);
    }
  return byId(
    [...found].map(([id, entry]) => ({
      id,
      kind: "terminal-label" as const,
      source: entry.source,
      files: [...entry.files].sort(),
    })),
  );
}
