import { Schema } from "effect";
import { byId, itemFields, place, type SourceFile } from "./source.ts";
import {
  argumentsAt,
  matches,
  NAME,
  NUMBER,
  pythonTokens,
  STRING,
  textAt,
  type Tokens,
} from "./tokens.ts";

export const HerdrTaskCommand = Schema.Struct({
  ...itemFields("herdr-task-command"),
  /** Left out of the command list in `--help`: added with no help text, or taken before argparse runs. */
  hidden: Schema.Boolean,
});
export type HerdrTaskCommand = (typeof HerdrTaskCommand)["Type"];

/** A function in the CLI file that adds a command for its callers. */
interface Helper {
  /** The subparsers variable it adds to. */
  readonly group: string;
  /** Which of its arguments is the command's name. */
  readonly argument: number;
  readonly hidden: boolean;
}

type Route = readonly string[];

interface Reading {
  readonly file: SourceFile;
  readonly tokens: Tokens;
  /** A parser variable, and the words that reach its parser. */
  readonly parsers: Map<string, Route>;
  /** A subparsers variable, and the words every command added to it starts with. */
  readonly groups: Map<string, Route>;
  readonly helpers: Map<string, Helper>;
  readonly definitions: { name: string; parameters: string[] }[];
  readonly commands: Map<string, HerdrTaskCommand>;
  /** Words compared with the first argument before argparse runs. */
  readonly early: { name: string; line: number }[];
}

/** The variable a call's result is assigned to: `c` in `c = sub.add_parser(...)`. `at` is the called name. */
function assignedName({ list }: Tokens, at: number): string | undefined {
  let start = at;
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

/** `p = argparse.ArgumentParser(...)`: the parser every route starts from. */
function readRootParser(reading: Reading, at: number) {
  if (!matches(reading.tokens.list, at, ["ArgumentParser", "("])) return;
  const target = assignedName(reading.tokens, at);
  if (target !== undefined) reading.parsers.set(target, []);
}

/** `sub = p.add_subparsers(...)`: commands added to `sub` extend the route of `p`. */
function readSubparsers(reading: Reading, at: number) {
  const { list } = reading.tokens;
  if (!matches(list, at - 2, [NAME, ".", "add_subparsers", "("])) return;
  const route = reading.parsers.get(textAt(list, at - 2));
  const target = assignedName(reading.tokens, at);
  if (route !== undefined && target !== undefined)
    reading.groups.set(target, route);
}

function hasHelp(tokens: Tokens, open: number): boolean {
  return argumentsAt(tokens, open).some(([start]) =>
    matches(tokens.list, start, ["help", "="]),
  );
}

/** What a new command's parser is kept as: a group when its own subparsers follow at once, else a parser. */
function keepParser(reading: Reading, at: number, route: Route) {
  const { list, pair } = reading.tokens;
  const target = assignedName(reading.tokens, at);
  if (target === undefined) return;
  const close = pair.get(at + 1) ?? at;
  const nested = matches(list, close + 1, [".", "add_subparsers", "("]);
  (nested ? reading.groups : reading.parsers).set(target, route);
}

/** The first token of one of a call's arguments. `open` is the call's bracket. */
function argumentStart(tokens: Tokens, open: number, argument: number) {
  const [start] = argumentsAt(tokens, open)[argument] ?? [];
  return start === undefined ? undefined : tokens.list[start];
}

/** A command named with a quoted word, added to a group that is already known. */
function keepCommand(
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

/** `def cmd(name, ...)` whose body calls `sub.add_parser(name, ...)`: `cmd` adds commands to `sub`. */
function keepHelper(reading: Reading, at: number, parameter: string) {
  const definition = reading.definitions.findLast(({ parameters }) =>
    parameters.includes(parameter),
  );
  if (definition === undefined) return;
  reading.helpers.set(definition.name, {
    group: textAt(reading.tokens.list, at - 2),
    argument: definition.parameters.indexOf(parameter),
    hidden: !hasHelp(reading.tokens, at + 1),
  });
}

/** `sub.add_parser("name", ...)`, or the same call inside a helper, where the name is a parameter. */
function readAddParser(reading: Reading, at: number) {
  const { tokens } = reading;
  if (!matches(tokens.list, at - 2, [NAME, ".", "add_parser", "("])) return;
  const name = argumentStart(tokens, at + 1, 0);
  if (name === undefined) return;
  if (name.kind === "name") keepHelper(reading, at, name.text);
  if (name.kind !== "string") return;
  const group = textAt(tokens.list, at - 2);
  keepCommand(reading, at, group, name.text, !hasHelp(tokens, at + 1));
}

function readDefinition(reading: Reading, at: number) {
  const { list } = reading.tokens;
  if (!matches(list, at, ["def", NAME, "("])) return;
  const parameters = argumentsAt(reading.tokens, at + 2).map(([start]) =>
    textAt(list, start),
  );
  reading.definitions.push({ name: textAt(list, at + 1), parameters });
}

/** `cmd("where", ...)`: a helper's caller names the command. */
function readHelperCall(reading: Reading, at: number) {
  const { list } = reading.tokens;
  const helper = reading.helpers.get(textAt(list, at));
  if (helper === undefined || !matches(list, at, [NAME, "("])) return;
  if (matches(list, at - 1, ["def"])) return;
  const name = argumentStart(reading.tokens, at + 1, helper.argument);
  if (name?.kind === "string")
    keepCommand(reading, at, helper.group, name.text, helper.hidden);
}

/** `argv[:1] == ["_job"]`: a first word the program acts on itself, which argparse never sees. */
function readEarlyWord(reading: Reading, at: number) {
  const { list } = reading.tokens;
  const shape = [NAME, "[", ":", NUMBER, "]", "==", "[", STRING, "]"];
  const word = list[at + 7];
  if (!matches(list, at, shape) || word === undefined) return;
  if (!word.text.startsWith("-"))
    reading.early.push({ name: word.text, line: word.line });
}

const READERS = [
  readRootParser,
  readSubparsers,
  readDefinition,
  readAddParser,
  readHelperCall,
  readEarlyWord,
];

/**
 * Every subcommand the herdr-task CLI file registers, nested verbs included
 * (`auto add`), read from how the file calls argparse. A command added
 * through a helper function is found at the helper's call.
 */
export function herdrTaskCommands(file: SourceFile): HerdrTaskCommand[] {
  const reading: Reading = {
    file,
    tokens: pythonTokens(file),
    parsers: new Map(),
    groups: new Map(),
    helpers: new Map(),
    definitions: [],
    commands: new Map(),
    early: [],
  };
  reading.tokens.list.forEach((_, at) => {
    for (const read of READERS) read(reading, at);
  });
  // A registered command also named before argparse (`tick`) is listed once, as registered.
  for (const { name, line } of reading.early)
    if (!reading.commands.has(name))
      reading.commands.set(name, {
        id: name,
        kind: "herdr-task-command",
        source: place(file.path, line),
        hidden: true,
      });
  return byId([...reading.commands.values()]);
}
