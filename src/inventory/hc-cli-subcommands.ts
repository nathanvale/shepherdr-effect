import { Schema } from "effect";
import {
  byId,
  itemFields,
  matchesIn,
  place,
  type SourceFile,
} from "./source.ts";

/** `id` is the words after `hc`: one, or two for a grouped command (`machine ls`). */
export const HcCliSubcommand = Schema.Struct({
  ...itemFields("hc-cli-subcommand"),
  /** Every file that runs it, as a path from the fork root. */
  callers: Schema.Array(Schema.String),
});
export type HcCliSubcommand = (typeof HcCliSubcommand)["Type"];

/**
 * Where an `hc` command line starts, by language. Each pattern ends just
 * before the first word after the program. The whole text is searched, so a
 * command line inside a script kept as a string is found too.
 */
const STARTS: readonly { readonly suffix: string; readonly pattern: RegExp }[] =
  [
    // ["hc", "get", ...] and [hc, "get", ...], where `hc` holds the program's path
    { suffix: ".py", pattern: /\[\s*(?:"hc"|'hc'|hc)\s*,/g },
    // hc_json("get", ...)
    { suffix: ".py", pattern: /\bhc_json\(/g },
    // ["hc", "get", ...] and [process.env.SHEPHERDR_HC || "hc", "get", ...]
    { suffix: ".ts", pattern: /\[\s*(?:[\w.]+\s*\|\|\s*)?["']hc["']\s*,/g },
    // hc(["get", ...]) and this.hc(["get", ...]): a function that puts the program first
    { suffix: ".ts", pattern: /(?<![\w$])hc\(\s*\[/g },
    // spawn(endpoint.binary, ["connect"], ...): the program and its words apart
    { suffix: ".ts", pattern: /\bspawn\(\s*[\w.]*\bbinary\s*,\s*\[/g },
  ];

const WORD = /\s*(["'])([^"'\\\n]*)\1\s*,?/y;
const VERB = /^[a-z][a-z-]*$/;

/** The quoted words that open a list at a position, up to two. A variable or a spread ends them. */
function leadingWords(text: string, from: number): string[] {
  const words: string[] = [];
  let at = from;
  while (words.length < 2) {
    WORD.lastIndex = at;
    const word = WORD.exec(text);
    if (word === null) break;
    words.push(word[2] ?? "");
    at = WORD.lastIndex;
  }
  return words;
}

/**
 * The subcommand a command line names. A second plain word is part of it
 * (`file write`, `machine ls`): an option, an address in a variable or a
 * key name with a `+` is not.
 */
function subcommand(words: readonly string[]): string | undefined {
  const [verb, second] = words;
  if (verb === undefined || !VERB.test(verb)) return undefined;
  return second !== undefined && VERB.test(second) ? `${verb} ${second}` : verb;
}

/**
 * Every `hc` subcommand the given files run as a child process, read from the
 * argument lists they build.
 */
export function hcCliSubcommands(
  files: readonly SourceFile[],
): HcCliSubcommand[] {
  const found = new Map<string, { source: string; callers: Set<string> }>();
  for (const file of files)
    for (const { suffix, pattern } of STARTS) {
      if (!file.path.endsWith(suffix)) continue;
      for (const { match, line } of matchesIn(file, pattern)) {
        const words = leadingWords(file.text, match.index + match[0].length);
        const id = subcommand(words);
        if (id === undefined) continue;
        const entry = found.get(id) ?? {
          source: place(file.path, line),
          callers: new Set<string>(),
        };
        entry.callers.add(file.path);
        found.set(id, entry);
      }
    }
  return byId(
    [...found].map(([id, { source, callers }]) => ({
      id,
      kind: "hc-cli-subcommand" as const,
      source,
      callers: [...callers].sort(),
    })),
  );
}
