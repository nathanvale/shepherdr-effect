import { Schema } from "effect";
import {
  byId,
  itemFields,
  matchesWithLines,
  place,
  type SourceFile,
} from "./source.ts";

export const HcCliSubcommand = Schema.Struct({
  ...itemFields("hc-cli-subcommand"),
  callers: Schema.Array(Schema.String).annotateKey({
    description: "Every file that runs it, as a path from the fork root.",
  }),
}).annotate({
  description:
    "id is the words after hc: one, or two for a grouped command (machine ls).",
});
export type HcCliSubcommand = (typeof HcCliSubcommand)["Type"];

const COMMAND_LINE_STARTS: readonly {
  readonly suffix: string;
  readonly pattern: RegExp;
}[] = [
  { suffix: ".py", pattern: /\[\s*(?:"hc"|'hc'|hc)\s*,/g },
  { suffix: ".py", pattern: /\bhc_json\(/g },
  { suffix: ".ts", pattern: /\[\s*(?:[\w.]+\s*\|\|\s*)?["']hc["']\s*,/g },
  { suffix: ".ts", pattern: /(?<![\w$])hc\(\s*\[/g },
  { suffix: ".ts", pattern: /\bspawn\(\s*[\w.]*\bbinary\s*,\s*\[/g },
];

const WORD = /\s*(["'])([^"'\\\n]*)\1\s*,?/y;
const VERB = /^[a-z][a-z-]*$/;

function leadingQuotedWords(text: string, from: number): string[] {
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

function subcommand(words: readonly string[]): string | undefined {
  const [verb, second] = words;
  if (verb === undefined || !VERB.test(verb)) return undefined;
  return second !== undefined && VERB.test(second) ? `${verb} ${second}` : verb;
}

export function hcCliSubcommands(
  files: readonly SourceFile[],
): HcCliSubcommand[] {
  const found = new Map<string, { source: string; callers: Set<string> }>();
  for (const file of files)
    for (const { suffix, pattern } of COMMAND_LINE_STARTS) {
      if (!file.path.endsWith(suffix)) continue;
      for (const { match, line } of matchesWithLines(file, pattern)) {
        const words = leadingQuotedWords(
          file.text,
          match.index + match[0].length,
        );
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
