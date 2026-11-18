import { Schema } from "effect";

/** What every inventory item says: its name in its list, what it is and where it was read. */
export interface Item {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
}

/** The fields every item's schema starts with. `kind` is the same for a whole list. */
export const itemFields = <Kind extends string>(kind: Kind) => ({
  id: Schema.String,
  kind: Schema.Literal(kind),
  source: Schema.String.check(Schema.isPattern(/^[^:]+:\d+$/)),
});

/** One file of the old system, read as text. `path` is from the fork root, with `/` between its parts. */
export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** A place in a source file, as every inventory item names it. */
export function place(path: string, line: number): string {
  return `${path}:${String(line)}`;
}

/** The line a position in a text is on. The first line is 1. */
export function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Order by id, one code unit at a time. A locale's order can change between
 * machines, and the committed files must not.
 */
export function byId<Item extends { readonly id: string }>(
  items: readonly Item[],
): Item[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The file at a path, or a failure that names it. */
export function fileAt(files: readonly SourceFile[], path: string): SourceFile {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`${path} is missing from the fork.`);
  return file;
}

/** Every match of a pattern in a file, each with the line it starts on. */
export function matchesIn(
  file: SourceFile,
  pattern: RegExp,
): { readonly match: RegExpExecArray; readonly line: number }[] {
  return [...file.text.matchAll(pattern)].map((match) => ({
    match,
    line: lineAt(file.text, match.index),
  }));
}
