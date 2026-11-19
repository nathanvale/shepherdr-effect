import { Schema } from "effect";
import {
  byId,
  itemFields,
  matchesWithLines,
  place,
  type SourceFile,
} from "./source.ts";

export const TerminalLabel = Schema.Struct({
  ...itemFields("terminal-label"),
  files: Schema.Array(Schema.String).annotateKey({
    description: "Every file that names it, as a path from the fork root.",
  }),
}).annotate({
  description:
    "id is the label's name. One that ends in .* is a prefix: the code adds a name after it.",
});
export type TerminalLabel = (typeof TerminalLabel)["Type"];

const LABEL_AT_STRING_START =
  /["'`](herdr\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)(\.?)/g;

export function terminalLabels(files: readonly SourceFile[]): TerminalLabel[] {
  const found = new Map<string, { source: string; files: Set<string> }>();
  for (const file of files)
    for (const { match, line } of matchesWithLines(
      file,
      LABEL_AT_STRING_START,
    )) {
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
