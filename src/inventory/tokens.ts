import type { SourceFile } from "./source.ts";

export interface Token {
  readonly kind: "name" | "string" | "regex" | "number" | "punct";
  readonly text: string;
  readonly line: number;
}

export type BracketIndex = number;

export interface Tokens {
  readonly list: readonly Token[];
  readonly partnerOf: ReadonlyMap<BracketIndex, BracketIndex>;
}

export type ExclusiveSpan = readonly [start: number, end: number];

interface Read {
  readonly raw: string;
  readonly text: string;
}

interface Rule {
  readonly kind: Token["kind"] | "skip";
  read(text: string, at: number): Read | undefined;
}

function patternRule(kind: Rule["kind"], source: RegExp, keptGroup = 0): Rule {
  const sticky = new RegExp(source.source, "y");
  return {
    kind,
    read(text, at) {
      sticky.lastIndex = at;
      const match = sticky.exec(text);
      if (match === null) return undefined;
      return { raw: match[0], text: match[keptGroup] ?? "" };
    },
  };
}

function firstRead(rules: readonly Rule[], text: string, at: number) {
  for (const rule of rules) {
    const read = rule.read(text, at);
    if (read !== undefined) return { kind: rule.kind, ...read };
  }
  return skipOneCharacter(text, at);
}

function skipOneCharacter(text: string, at: number) {
  return { kind: "skip" as const, raw: text.slice(at, at + 1), text: "" };
}

function scan(
  text: string,
  from: number,
  rulesAfter: (previous: Token | undefined) => readonly Rule[],
  isLastToken: (token: Token) => boolean,
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
      if (isLastToken(token)) break;
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

export function textAtOrEmpty(list: readonly Token[], at: number): string {
  return list[at]?.text ?? "";
}

function pairedBrackets(file: SourceFile, list: readonly Token[]): Tokens {
  const partnerOf = new Map<number, number>();
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
    if (textAtOrEmpty(list, start) !== OPENED_BY[token.text])
      throw alone(index);
    partnerOf.set(start, index).set(index, start);
  }
  if (open.length > 0) throw alone(open.at(-1) ?? 0);
  return { list, partnerOf };
}

const never = () => false;

const PYTHON: readonly Rule[] = [
  patternRule("skip", /\s+|#[^\n]*|\\\r?\n/),
  patternRule("string", /[bBfFrRuU]{0,2}("""|''')([\s\S]*?)\1/, 2),
  patternRule(
    "string",
    /[bBfFrRuU]{0,2}(["'])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/,
    2,
  ),
  patternRule("name", /[A-Za-z_]\w*/),
  patternRule("number", /\d[\w.]*/),
  patternRule("punct", /[=!<>]=|[\s\S]/),
];

export function pythonTokens(file: SourceFile): Tokens {
  return pairedBrackets(file, scan(file.text, 0, () => PYTHON, never).list);
}

const SPACE = patternRule("skip", /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\//);
const QUOTED = patternRule(
  "string",
  /(["'])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/,
  2,
);
const TEMPLATE: Rule = { kind: "string", read: template };
const REGEX = patternRule(
  "regex",
  /\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\[\n])+\/[A-Za-z]*/,
);
const WORDS = [
  patternRule("name", /[A-Za-z_$][\w$]*/),
  patternRule("number", /\d[\w.]*/),
  patternRule("punct", /[=!]==?|=>|&&|\|\||\?\?|\?\.|\.\.\.|[\s\S]/),
];
const CODE: readonly Rule[] = [SPACE, QUOTED, TEMPLATE, ...WORDS];
const CODE_OR_REGEX: readonly Rule[] = [
  SPACE,
  QUOTED,
  TEMPLATE,
  REGEX,
  ...WORDS,
];

const WORDS_BEFORE_REGEX = new Set([
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
  return previous.kind === "name" && WORDS_BEFORE_REGEX.has(previous.text)
    ? CODE_OR_REGEX
    : CODE;
}

function closesInterpolation(): (token: Token) => boolean {
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
  if (text.startsWith("${", at)) return afterInterpolation(text, at);
  return at + 1;
}

function afterInterpolation(text: string, at: number): number {
  return scan(text, at + 2, scriptRules, closesInterpolation()).end;
}

function template(text: string, at: number): Read | undefined {
  if (text[at] !== "`") return undefined;
  let end = at + 1;
  while (end < text.length && text[end] !== "`")
    end = afterTemplatePart(text, end);
  const raw = text.slice(at, end + 1);
  return { raw, text: raw.slice(1, -1) };
}

export function scriptTokens(file: SourceFile): Tokens {
  return pairedBrackets(file, scan(file.text, 0, scriptRules, never).list);
}

export type OneWord = string;
export type OneOfWords = readonly string[];
export type AnyTokenOfKind = { readonly kind: Token["kind"] };

export type Want = OneWord | OneOfWords | AnyTokenOfKind;

export const NAME: Want = { kind: "name" };
export const STRING: Want = { kind: "string" };
export const NUMBER: Want = { kind: "number" };
export const REGEX_LITERAL: Want = { kind: "regex" };

function isNameOrPunct(token: Token): boolean {
  return token.kind === "name" || token.kind === "punct";
}

function fits(token: Token | undefined, want: Want): boolean {
  if (token === undefined) return false;
  if (typeof want === "string")
    return isNameOrPunct(token) && token.text === want;
  if ("kind" in want) return token.kind === want.kind;
  return isNameOrPunct(token) && want.includes(token.text);
}

export function matches(
  list: readonly Token[],
  at: number,
  wants: readonly Want[],
): boolean {
  return wants.every((want, offset) => fits(list[at + offset], want));
}

export function afterTokenOrGroup({ partnerOf }: Tokens, at: number): number {
  return Math.max(partnerOf.get(at) ?? at, at) + 1;
}

export function argumentsAt(tokens: Tokens, open: number): ExclusiveSpan[] {
  const close = tokens.partnerOf.get(open) ?? open;
  const found: ExclusiveSpan[] = [];
  let start = open + 1;
  for (let at = start; at < close; at = afterTokenOrGroup(tokens, at)) {
    if (!matches(tokens.list, at, [","])) continue;
    found.push([start, at]);
    start = at + 1;
  }
  if (start < close) found.push([start, close]);
  return found;
}

export function semicolonOrCloser(tokens: Tokens, from: number): number {
  let at = from;
  while (at < tokens.list.length) {
    const closes = (tokens.partnerOf.get(at) ?? at) < at;
    if (closes || matches(tokens.list, at, [";"])) return at;
    at = afterTokenOrGroup(tokens, at);
  }
  return at;
}
