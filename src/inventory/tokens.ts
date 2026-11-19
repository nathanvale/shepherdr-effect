import type { SourceFile } from "./source.ts";

/** One word of source text: enough to find calls, comparisons and blocks. */
export interface Token {
  readonly kind: "name" | "string" | "regex" | "number" | "punct";
  /** A string's text is what stands between its quotes, as written. A regex keeps its slashes. */
  readonly text: string;
  readonly line: number;
}

export interface Tokens {
  readonly list: readonly Token[];
  /** For a bracket's index, the index of the bracket that closes or opens it. */
  readonly pair: ReadonlyMap<number, number>;
}

interface Read {
  readonly raw: string;
  readonly text: string;
}

interface Rule {
  readonly kind: Token["kind"] | "skip";
  read(text: string, at: number): Read | undefined;
}

/** A rule that reads what a pattern matches at a position. `group` is the part kept as the token's text. */
function pattern(kind: Rule["kind"], source: RegExp, group = 0): Rule {
  const sticky = new RegExp(source.source, "y");
  return {
    kind,
    read(text, at) {
      sticky.lastIndex = at;
      const match = sticky.exec(text);
      if (match === null) return undefined;
      return { raw: match[0], text: match[group] ?? "" };
    },
  };
}

function firstRead(rules: readonly Rule[], text: string, at: number) {
  for (const rule of rules) {
    const read = rule.read(text, at);
    if (read !== undefined) return { kind: rule.kind, ...read };
  }
  // Every rule list ends with one that takes any character.
  return { kind: "skip" as const, raw: text.slice(at, at + 1), text: "" };
}

/**
 * Reads tokens from a position until the text ends or `done` says a token
 * was the last. The rules can depend on the token before, which is how a
 * script's `/` is told apart as a division or the start of a regex.
 */
function scan(
  text: string,
  from: number,
  rulesAfter: (previous: Token | undefined) => readonly Rule[],
  done: (token: Token) => boolean,
): { readonly list: Token[]; readonly end: number } {
  const list: Token[] = [];
  let at = from;
  let line = 1;
  while (at < text.length) {
    const read = firstRead(rulesAfter(list.at(-1)), text, at);
    at += read.raw.length;
    if (read.kind !== "skip") {
      const token = { kind: read.kind, text: read.text, line };
      list.push(token);
      if (done(token)) break;
    }
    line += read.raw.split("\n").length - 1;
  }
  return { list, end: at };
}

const OPENED_BY: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
  "}": "{",
};
const OPENERS = new Set(Object.values(OPENED_BY));

/** The text of the token at an index, or nothing where there is no token. */
export function textAt(list: readonly Token[], at: number): string {
  return list[at]?.text ?? "";
}

/**
 * Pairs every bracket with its partner. A file whose brackets do not pair up
 * was read wrongly (or is not whole), and a list taken from it would be
 * quietly short: that is refused instead.
 */
function paired(file: SourceFile, list: readonly Token[]): Tokens {
  const pair = new Map<number, number>();
  const open: number[] = [];
  const alone = (index: number) =>
    new Error(
      `${file.path}:${String(list[index]?.line ?? 0)} has a bracket with no partner, so the file's structure cannot be read.`,
    );
  for (const [index, token] of list.entries()) {
    if (token.kind !== "punct") continue;
    if (OPENERS.has(token.text)) open.push(index);
    if (!Object.hasOwn(OPENED_BY, token.text)) continue;
    const start = open.pop() ?? -1;
    if (textAt(list, start) !== OPENED_BY[token.text]) throw alone(index);
    pair.set(start, index).set(index, start);
  }
  if (open.length > 0) throw alone(open.at(-1) ?? 0);
  return { list, pair };
}

const never = () => false;

const PYTHON: readonly Rule[] = [
  pattern("skip", /\s+|#[^\n]*|\\\r?\n/),
  pattern("string", /[bBfFrRuU]{0,2}("""|''')([\s\S]*?)\1/, 2),
  pattern("string", /[bBfFrRuU]{0,2}(["'])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/, 2),
  pattern("name", /[A-Za-z_]\w*/),
  pattern("number", /\d[\w.]*/),
  pattern("punct", /[=!<>]=|[\s\S]/),
];

/** Python source as tokens. Comments are dropped, and a string is one token whatever it holds. */
export function pythonTokens(file: SourceFile): Tokens {
  return paired(file, scan(file.text, 0, () => PYTHON, never).list);
}

const SPACE = pattern("skip", /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\//);
const QUOTED = pattern("string", /(["'])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/, 2);
const TEMPLATE: Rule = { kind: "string", read: template };
const REGEX = pattern(
  "regex",
  /\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\[\n])+\/[A-Za-z]*/,
);
const WORDS = [
  pattern("name", /[A-Za-z_$][\w$]*/),
  pattern("number", /\d[\w.]*/),
  pattern("punct", /[=!]==?|=>|&&|\|\||\?\?|\?\.|\.\.\.|[\s\S]/),
];
const CODE: readonly Rule[] = [SPACE, QUOTED, TEMPLATE, ...WORDS];
const CODE_OR_REGEX: readonly Rule[] = [
  SPACE,
  QUOTED,
  TEMPLATE,
  REGEX,
  ...WORDS,
];

// After a value a `/` divides. After these words, as after an operator, it starts a regex.
const BEFORE_REGEX = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "delete",
  "void",
  "throw",
  "new",
  "else",
  "do",
  "instanceof",
  "yield",
  "await",
]);

function scriptRules(previous: Token | undefined): readonly Rule[] {
  if (previous === undefined) return CODE_OR_REGEX;
  if (previous.kind === "punct")
    return [")", "]", "}"].includes(previous.text) ? CODE : CODE_OR_REGEX;
  return previous.kind === "name" && BEFORE_REGEX.has(previous.text)
    ? CODE_OR_REGEX
    : CODE;
}

/** True for the `}` that ends a template's `${`: the first one with no `{` of its own. */
function endsInterpolation(): (token: Token) => boolean {
  let depth = 0;
  return ({ kind, text }) => {
    if (kind !== "punct") return false;
    if (text === "{") depth += 1;
    if (text === "}") depth -= 1;
    return depth < 0;
  };
}

function afterTemplatePart(text: string, at: number): number {
  if (text[at] === "\\") return at + 2;
  // What a `${` holds is code, with strings and templates of its own.
  if (text.startsWith("${", at))
    return scan(text, at + 2, scriptRules, endsInterpolation()).end;
  return at + 1;
}

function template(text: string, at: number): Read | undefined {
  if (text[at] !== "`") return undefined;
  let end = at + 1;
  while (end < text.length && text[end] !== "`")
    end = afterTemplatePart(text, end);
  const raw = text.slice(at, end + 1);
  return { raw, text: raw.slice(1, -1) };
}

/** TypeScript or JavaScript source as tokens. Comments are dropped. */
export function scriptTokens(file: SourceFile): Tokens {
  return paired(file, scan(file.text, 0, scriptRules, never).list);
}

/** What a token must be: this word, one of these words, or any token of a kind. */
export type Want =
  | string
  | readonly string[]
  | { readonly kind: Token["kind"] };

export const NAME: Want = { kind: "name" };
export const STRING: Want = { kind: "string" };
export const NUMBER: Want = { kind: "number" };
export const REGEX_LITERAL: Want = { kind: "regex" };

function isWord(token: Token): boolean {
  return token.kind === "name" || token.kind === "punct";
}

function fits(token: Token | undefined, want: Want): boolean {
  if (token === undefined) return false;
  if (typeof want === "string") return isWord(token) && token.text === want;
  if ("kind" in want) return token.kind === want.kind;
  return isWord(token) && want.includes(token.text);
}

/** True when the tokens from a position are these, one after another. A quoted word never passes for a bare one. */
export function matches(
  list: readonly Token[],
  at: number,
  wants: readonly Want[],
): boolean {
  return wants.every((want, offset) => fits(list[at + offset], want));
}

/** The index after a token, or after the whole group when the token opens one. */
export function after({ pair }: Tokens, at: number): number {
  return Math.max(pair.get(at) ?? at, at) + 1;
}

/** What stands between a bracket and its partner, split at its own commas, each as [start, end). */
export function argumentsAt(tokens: Tokens, open: number): [number, number][] {
  const close = tokens.pair.get(open) ?? open;
  const found: [number, number][] = [];
  let start = open + 1;
  for (let at = start; at < close; at = after(tokens, at)) {
    if (!matches(tokens.list, at, [","])) continue;
    found.push([start, at]);
    start = at + 1;
  }
  if (start < close) found.push([start, close]);
  return found;
}

/** Where the statement that holds a position ends: its `;`, or the bracket that closes around it. */
export function statementEnd(tokens: Tokens, from: number): number {
  let at = from;
  while (at < tokens.list.length) {
    const closes = (tokens.pair.get(at) ?? at) < at;
    if (closes || matches(tokens.list, at, [";"])) return at;
    at = after(tokens, at);
  }
  return at;
}
