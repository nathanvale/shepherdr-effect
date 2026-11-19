import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type FaultPatch = { id: string; patch: string };

export function quoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export type Hunk = {
  path: string;
  number: number;
  before: readonly string[];
  anchor: readonly string[];
  replacement: readonly string[];
  after: readonly string[];
  insertion: boolean;
};

export type Source = {
  read(path: string): string | undefined;
  holding(line: string): readonly string[];
};

export type Placement =
  | { kind: "placed"; files: ReadonlyMap<string, string> }
  | { kind: "refused"; cause: string; candidates: readonly string[] };

type Spot = { path: string; line: number };

const hunkLine = /^[ +\\-]/;
const fileHeader = /^(?:---|\+\+\+) (?!\/dev\/null$)/;
const placesNamed = 10;

function kept(lines: readonly string[], dropped: "+" | "-"): string[] {
  return lines
    .filter((line) => !line.startsWith(dropped))
    .map((line) => line.slice(1));
}

function shaped(path: string, number: number, body: readonly string[]) {
  const regions: { first: number; last: number }[] = [];
  for (const [index, line] of body.entries()) {
    if (line.startsWith(" ")) continue;
    const open = regions.at(-1);
    if (open?.last === index - 1) open.last = index;
    else regions.push({ first: index, last: index });
  }
  return regions.map(({ first, last }, index): Hunk => {
    const insertion = !body
      .slice(first, last + 1)
      .some((line) => line.startsWith("-"));
    const from = insertion ? (regions[index - 1]?.last ?? -1) + 1 : first;
    const to = insertion
      ? (regions[index + 1]?.first ?? body.length)
      : last + 1;
    const span = body.slice(from, to);
    return {
      path,
      number,
      before: kept(body.slice(0, from), "-"),
      anchor: kept(span, "+"),
      replacement: kept(span, "-"),
      after: kept(body.slice(to), "+"),
      insertion,
    };
  });
}

export function hunksOf(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let path = "";
  let body: string[] | undefined;
  let number = 0;
  const close = () => {
    if (body !== undefined && body.length > 0) {
      number += 1;
      hunks.push(...shaped(path, number, body));
    }
    body = undefined;
  };
  for (const line of patch.split("\n")) {
    if (body !== undefined && hunkLine.test(line)) {
      if (!line.startsWith("\\")) body.push(line);
      continue;
    }
    close();
    if (fileHeader.test(line)) path = line.slice(4).replace(/^[ab]\//, "");
    if (line.startsWith("@@ ")) body = [];
  }
  close();
  return hunks;
}

function holds(
  lines: readonly string[],
  start: number,
  wanted: readonly string[],
): boolean {
  return (
    start >= 0 && wanted.every((line, offset) => lines[start + offset] === line)
  );
}

function linesIn(text: string): string[] {
  return text === "" ? [] : text.replace(/\n$/, "").split("\n");
}

function replaced(text: string, spot: Spot, hunk: Hunk): string {
  const lines = linesIn(text);
  lines.splice(spot.line, hunk.anchor.length, ...hunk.replacement);
  return `${lines.join("\n")}${text.endsWith("\n") ? "\n" : ""}`;
}

function spotsIn(path: string, text: string, anchor: readonly string[]) {
  const lines = linesIn(text);
  const spots: Spot[] = [];
  if (anchor.length === 0) return spots;
  for (let line = 0; line + anchor.length <= lines.length; line += 1)
    if (holds(lines, line, anchor)) spots.push({ path, line });
  return spots;
}

function matched(
  lines: readonly string[],
  start: number,
  wanted: readonly string[],
  step: 1 | -1,
): number {
  let count = 0;
  while (count < wanted.length && lines[start + count * step] === wanted[count])
    count += 1;
  return count;
}

function chosen(
  spots: readonly Spot[],
  hunk: Hunk,
  linesOf: (path: string) => readonly string[],
): Spot | undefined {
  const nearestFirst = hunk.before.toReversed();
  const reach = spots.map((spot) => {
    const lines = linesOf(spot.path);
    return {
      spot,
      before: matched(lines, spot.line - 1, nearestFirst, -1),
      after: matched(lines, spot.line + hunk.anchor.length, hunk.after, 1),
    };
  });
  return reach.find((each) =>
    reach.every(
      (other) =>
        other === each ||
        (each.before >= other.before &&
          each.after >= other.after &&
          (each.before > other.before || each.after > other.after)),
    ),
  )?.spot;
}

function anchorRefusal(hunk: Hunk, spots: readonly Spot[]): string {
  const what = `${hunk.insertion ? "the context" : "the removed text"} of hunk ${hunk.number}, starting "${(hunk.anchor[0] ?? "").trim()}"`;
  if (spots.length === 0)
    return `anchor absent: ${what}, is not in ${hunk.path}${hunk.insertion ? "" : " or any other tracked file"}.`;
  const named = spots
    .slice(0, placesNamed)
    .map(({ path, line }) => `${path}:${line + 1}`);
  if (spots.length > placesNamed)
    named.push(`and ${spots.length - placesNamed} more`);
  return `anchor ambiguous: ${what}, is at ${spots.length} places: ${named.join(", ")}. Its context lines do not choose one, and a planted fault in the wrong place still fails its test, so it was not applied.`;
}

export function place(
  patchPath: string,
  patch: string,
  source: Source,
): Placement {
  if (/^(?:---|\+\+\+) \/dev\/null$/m.test(patch))
    return {
      kind: "refused",
      cause: `${patchPath} creates or deletes a whole file, which replay does not place. It plants a fault only inside a file that exists before and after the patch.`,
      candidates: [],
    };
  const hunks = hunksOf(patch);
  if (hunks.length === 0)
    return {
      kind: "refused",
      cause: `${patchPath} holds no hunk to apply.`,
      candidates: [],
    };
  const files = new Map<string, string>();
  const textOf = (path: string) => files.get(path) ?? source.read(path);
  const linesOf = (path: string) => linesIn(textOf(path) ?? "");
  for (const hunk of hunks) {
    const recorded = textOf(hunk.path);
    let spots =
      recorded === undefined ? [] : spotsIn(hunk.path, recorded, hunk.anchor);
    if (spots.length === 0 && !hunk.insertion) {
      const longest = hunk.anchor.reduce(
        (kept, line) => (line.length > kept.length ? line : kept),
        "",
      );
      spots = source.holding(longest).flatMap((path) => {
        const text = textOf(path);
        return text === undefined ? [] : spotsIn(path, text, hunk.anchor);
      });
    }
    const spot = chosen(spots, hunk, linesOf);
    if (spot === undefined)
      return {
        kind: "refused",
        cause: anchorRefusal(hunk, spots),
        candidates: [...files.keys(), ...spots.map(({ path }) => path)],
      };
    files.set(spot.path, replaced(textOf(spot.path) ?? "", spot, hunk));
  }
  return { kind: "placed", files };
}

export function replantRepair(fault: FaultPatch): string {
  return `Repair: plant the fault again by hand, run git diff -- <each file you edited> > ${quoted(fault.patch)}, then undo the planted edit. Done when bun run fault-replay ${fault.id} passes.`;
}

export function patchText(root: string, fault: FaultPatch): string {
  const path = join(root, fault.patch);
  if (!existsSync(path))
    throw new Error(
      `${fault.patch} does not exist, so ${fault.id} has no planted fault to apply. ${replantRepair(fault)}`,
    );
  return readFileSync(path, "utf8");
}

export function sourceIn(dir: string, tracked: ReadonlySet<string>): Source {
  const texts = new Map<string, string | undefined>();
  const read = (path: string) => {
    if (!texts.has(path)) {
      const full = join(dir, path);
      texts.set(
        path,
        tracked.has(path) && statSync(full, { throwIfNoEntry: false })?.isFile()
          ? readFileSync(full, "utf8")
          : undefined,
      );
    }
    return texts.get(path);
  };
  return {
    read,
    holding: (line) =>
      [...tracked].filter((path) => read(path)?.includes(line) === true),
  };
}
