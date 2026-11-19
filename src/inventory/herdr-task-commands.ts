import { Schema } from "effect";
import { byId, itemFields, place, type SourceFile } from "./source.ts";
import {
  argumentsAt,
  matches,
  NAME,
  NUMBER,
  pythonTokens,
  STRING,
  textAtOrEmpty,
  type Tokens,
} from "./tokens.ts";

export const HerdrTaskCommand = Schema.Struct({
  ...itemFields("herdr-task-command"),
  hidden: Schema.Boolean.annotateKey({
    description:
      "Left out of the command list in --help: added with no help text, or taken before argparse runs.",
  }),
});
export type HerdrTaskCommand = (typeof HerdrTaskCommand)["Type"];

type SubparsersVariable = string;
type ParserVariable = string;
type ArgumentIndex = number;

interface CommandAdder {
  readonly group: SubparsersVariable;
  readonly nameArgument: ArgumentIndex;
  readonly hidden: boolean;
}

type Route = readonly string[];

interface Reading {
  readonly file: SourceFile;
  readonly tokens: Tokens;
  readonly parsers: Map<ParserVariable, Route>;
  readonly groups: Map<SubparsersVariable, Route>;
  readonly commandAdders: Map<string, CommandAdder>;
  readonly definitions: { name: string; parameters: string[] }[];
  readonly commands: Map<string, HerdrTaskCommand>;
  readonly wordsBeforeArgparse: { name: string; line: number }[];
}

function assignedName({ list }: Tokens, calledAt: number): string | undefined {
  let start = calledAt;
  while (matches(list, start - 2, [NAME, "."])) start -= 2;
  return matches(list, start - 2, [NAME, "="])
    ? list[start - 2]?.text
    : undefined;
}

function keep(reading: Reading, route: Route, at: number, hidden: boolean) {
  const id = route.join(" ");
  const line = reading.tokens.list[at]?.line ?? 0;
  if (reading.commands.has(id)) return;
  reading.commands.set(id, {
    id,
    kind: "herdr-task-command",
    source: place(reading.file.path, line),
    hidden,
  });
}

function readRootParser(reading: Reading, at: number) {
  if (!matches(reading.tokens.list, at, ["ArgumentParser", "("])) return;
  const target = assignedName(reading.tokens, at);
  if (target !== undefined) reading.parsers.set(target, []);
}

function readSubparsers(reading: Reading, at: number) {
  const { list } = reading.tokens;
  if (!matches(list, at - 2, [NAME, ".", "add_subparsers", "("])) return;
  const route = reading.parsers.get(textAtOrEmpty(list, at - 2));
  const target = assignedName(reading.tokens, at);
  if (route !== undefined && target !== undefined)
    reading.groups.set(target, route);
}

function hasHelp(tokens: Tokens, open: number): boolean {
  return argumentsAt(tokens, open).some(([start]) =>
    matches(tokens.list, start, ["help", "="]),
  );
}

function keepParser(reading: Reading, at: number, route: Route) {
  const { list, partnerOf } = reading.tokens;
  const target = assignedName(reading.tokens, at);
  if (target === undefined) return;
  const close = partnerOf.get(at + 1) ?? at;
  const nested = matches(list, close + 1, [".", "add_subparsers", "("]);
  (nested ? reading.groups : reading.parsers).set(target, route);
}

function argumentStart(
  tokens: Tokens,
  callBracket: number,
  argument: ArgumentIndex,
) {
  const [start] = argumentsAt(tokens, callBracket)[argument] ?? [];
  return start === undefined ? undefined : tokens.list[start];
}

function keepQuotedCommand(
  reading: Reading,
  at: number,
  groupName: string,
  word: string,
  hidden: boolean,
) {
  const group = reading.groups.get(groupName);
  if (group === undefined) return;
  const route = [...group, word];
  keep(reading, route, at, hidden);
  keepParser(reading, at, route);
}

function keepCommandAdder(reading: Reading, at: number, parameter: string) {
  const definition = reading.definitions.findLast(({ parameters }) =>
    parameters.includes(parameter),
  );
  if (definition === undefined) return;
  reading.commandAdders.set(definition.name, {
    group: textAtOrEmpty(reading.tokens.list, at - 2),
    nameArgument: definition.parameters.indexOf(parameter),
    hidden: !hasHelp(reading.tokens, at + 1),
  });
}

function readAddParser(reading: Reading, at: number) {
  const { tokens } = reading;
  if (!matches(tokens.list, at - 2, [NAME, ".", "add_parser", "("])) return;
  const name = argumentStart(tokens, at + 1, 0);
  if (name === undefined) return;
  if (name.kind === "name") keepCommandAdder(reading, at, name.text);
  if (name.kind !== "string") return;
  const group = textAtOrEmpty(tokens.list, at - 2);
  keepQuotedCommand(reading, at, group, name.text, !hasHelp(tokens, at + 1));
}

function readDefinition(reading: Reading, at: number) {
  const { list } = reading.tokens;
  if (!matches(list, at, ["def", NAME, "("])) return;
  const parameters = argumentsAt(reading.tokens, at + 2).map(([start]) =>
    textAtOrEmpty(list, start),
  );
  reading.definitions.push({ name: textAtOrEmpty(list, at + 1), parameters });
}

function readCommandAdderCall(reading: Reading, at: number) {
  const { list } = reading.tokens;
  const adder = reading.commandAdders.get(textAtOrEmpty(list, at));
  if (adder === undefined || !matches(list, at, [NAME, "("])) return;
  if (matches(list, at - 1, ["def"])) return;
  const name = argumentStart(reading.tokens, at + 1, adder.nameArgument);
  if (name?.kind === "string")
    keepQuotedCommand(reading, at, adder.group, name.text, adder.hidden);
}

function readWordBeforeArgparse(reading: Reading, at: number) {
  const { list } = reading.tokens;
  const shape = [NAME, "[", ":", NUMBER, "]", "==", "[", STRING, "]"];
  const word = list[at + 7];
  if (!matches(list, at, shape) || word === undefined) return;
  if (!word.text.startsWith("-"))
    reading.wordsBeforeArgparse.push({ name: word.text, line: word.line });
}

const READERS = [
  readRootParser,
  readSubparsers,
  readDefinition,
  readAddParser,
  readCommandAdderCall,
  readWordBeforeArgparse,
];

export function herdrTaskCommands(file: SourceFile): HerdrTaskCommand[] {
  const reading: Reading = {
    file,
    tokens: pythonTokens(file),
    parsers: new Map(),
    groups: new Map(),
    commandAdders: new Map(),
    definitions: [],
    commands: new Map(),
    wordsBeforeArgparse: [],
  };
  reading.tokens.list.forEach((_, at) => {
    for (const read of READERS) read(reading, at);
  });
  for (const { name, line } of reading.wordsBeforeArgparse)
    if (!reading.commands.has(name))
      reading.commands.set(name, {
        id: name,
        kind: "herdr-task-command",
        source: place(file.path, line),
        hidden: true,
      });
  return byId([...reading.commands.values()]);
}
