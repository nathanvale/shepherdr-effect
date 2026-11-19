import { Schema } from "effect";
import { byId, fileAt, itemFields, place, type SourceFile } from "./source.ts";
import {
  after,
  argumentsAt,
  matches,
  scriptTokens,
  STRING,
  type Token,
  type Tokens,
} from "./tokens.ts";

export const ServiceAction = Schema.Struct({
  ...itemFields("service-action"),
  handler: Schema.Literals(["actions.ts", "main.ts"]),
}).annotate({
  description:
    "id is the action's type. When both files handle one, each is listed, with @ and its file after the name.",
});
export type ServiceAction = (typeof ServiceAction)["Type"];

const PAGE_ACTION_HANDLERS: readonly {
  readonly handler: ServiceAction["handler"];
  readonly path: string;
  readonly function: string;
}[] = [
  { handler: "actions.ts", path: "service/actions.ts", function: "act" },
  { handler: "main.ts", path: "service/main.ts", function: "doAction" },
];

const EQUALS = ["===", "=="];
const MEMBER = [".", "?."];

interface Named {
  readonly name: string;
  readonly line: number;
}

function functionBody(tokens: Tokens, name: string) {
  const { list, pair } = tokens;
  const at = list.findIndex((_, index) =>
    matches(list, index, ["function", name, "("]),
  );
  if (at < 0) return undefined;
  const parameters = argumentsAt(tokens, at + 2).map(
    ([start]) => list[start]?.text ?? "",
  );
  const from = after(tokens, at + 2);
  const open = list.findIndex(
    (_, index) => index >= from && matches(list, index, ["{"]),
  );
  return { parameters, open, close: pair.get(open) ?? open };
}

function comparedTypeWord({ list }: Tokens, at: number, parameters: string[]) {
  const word = list[at + 4];
  return matches(list, at, [parameters, MEMBER, "type", EQUALS, STRING])
    ? word
    : undefined;
}

function switchedTypeWords(tokens: Tokens, at: number, parameters: string[]) {
  const { list, pair } = tokens;
  const shape = ["switch", "(", parameters, MEMBER, "type", ")", "{"];
  const close = pair.get(at + 6);
  if (!matches(list, at, shape) || close === undefined) return [];
  const labels: (Token | undefined)[] = [];
  for (let index = at + 7; index < close; index = after(tokens, index))
    if (matches(list, index, ["case", STRING])) labels.push(list[index + 1]);
  return labels;
}

function handled(file: SourceFile, name: string): Named[] {
  const tokens = scriptTokens(file);
  const body = functionBody(tokens, name);
  if (body === undefined)
    throw new Error(`${file.path} has no function named ${name}.`);
  const first = new Map<string, number>();
  for (let at = body.open; at < body.close; at += 1) {
    const words = [
      comparedTypeWord(tokens, at, body.parameters),
      ...switchedTypeWords(tokens, at, body.parameters),
    ];
    for (const word of words)
      if (word !== undefined && !first.has(word.text))
        first.set(word.text, word.line);
  }
  return [...first].map(([action, line]) => ({ name: action, line }));
}

export function serviceActions(files: readonly SourceFile[]): ServiceAction[] {
  const found = PAGE_ACTION_HANDLERS.flatMap(
    ({ handler, path, function: name }) =>
      handled(fileAt(files, path), name).map((action) => ({
        ...action,
        handler,
        path,
      })),
  );
  const count = (name: string) =>
    found.filter((action) => action.name === name).length;
  return byId(
    found.map(({ name, line, handler, path }) => ({
      id: count(name) > 1 ? `${name}@${handler}` : name,
      kind: "service-action" as const,
      source: place(path, line),
      handler,
    })),
  );
}
