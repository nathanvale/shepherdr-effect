import { Schema } from "effect";

export interface Item {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
}

export const itemFields = <Kind extends string>(kind: Kind) => ({
  id: Schema.String.annotateKey({
    description: "The item's name in its list.",
  }),
  kind: Schema.Literal(kind).annotateKey({
    description: "What the item is. It is the same for a whole list.",
  }),
  source: Schema.String.check(Schema.isPattern(/^[^:]+:\d+$/)).annotateKey({
    description:
      "Where the item was read: a path from the fork root, a colon and a line number.",
  }),
});

export type SlashPathFromRoot = string;

export interface SourceFile {
  readonly path: SlashPathFromRoot;
  readonly text: string;
}

export function place(path: SlashPathFromRoot, line: number): string {
  return `${path}:${String(line)}`;
}

export function oneBasedLineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

export function byId<Item extends { readonly id: string }>(
  items: readonly Item[],
): Item[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function fileAtOrThrow(
  files: readonly SourceFile[],
  path: SlashPathFromRoot,
): SourceFile {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`${path} is missing from the fork.`);
  return file;
}

export interface MatchAtLine {
  readonly match: RegExpExecArray;
  readonly line: number;
}

export function matchesWithLines(
  file: SourceFile,
  pattern: RegExp,
): MatchAtLine[] {
  return [...file.text.matchAll(pattern)].map((match) => ({
    match,
    line: oneBasedLineAt(file.text, match.index),
  }));
}
