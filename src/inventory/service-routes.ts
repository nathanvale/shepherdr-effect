import { Schema } from "effect";
import { byId, itemFields, place, type SourceFile } from "./source.ts";
import {
  after,
  matches,
  NAME,
  REGEX_LITERAL,
  scriptTokens,
  statementEnd,
  STRING,
  type Tokens,
} from "./tokens.ts";

export const ServiceRoute = Schema.Struct({
  ...itemFields("service-route"),
  methods: Schema.optionalKey(Schema.Array(Schema.String)).annotateKey({
    description:
      "The methods the code compares beside this path, when it compares any.",
  }),
  websocket: Schema.Boolean.annotateKey({
    description: "True when the request is upgraded to a WebSocket.",
  }),
}).annotate({
  description:
    "id is the path as compared: exact, a prefix ending in *, or the regex it is tested with.",
});
export type ServiceRoute = (typeof ServiceRoute)["Type"];

type ExclusiveSpan = readonly [start: number, end: number];

interface Found {
  readonly id: string;
  readonly at: number;
}

const EQUALS = ["===", "=="];
const MEMBER = [".", "?."];
const within = (at: number, [start, end]: ExclusiveSpan) =>
  start < at && at < end;

function enclosingBlock({ list, pair }: Tokens, at: number): ExclusiveSpan {
  for (let index = at - 1; index >= 0; index -= 1) {
    const partner = pair.get(index);
    if (partner !== undefined && partner < index) index = partner;
    else if (partner !== undefined && matches(list, index, ["{"]))
      return [index, partner];
  }
  return [-1, list.length];
}

function pathVariables(
  tokens: Tokens,
): { name: string; scope: ExclusiveSpan }[] {
  const { list } = tokens;
  return list.flatMap((token, at) => {
    if (!matches(list, at, ["const", NAME, "="])) return [];
    const end = statementEnd(tokens, at + 3);
    const fromRequest = list
      .slice(at + 3, end)
      .some(({ kind, text }) => kind === "name" && text === "pathname");
    if (!fromRequest) return [];
    return [
      { name: list[at + 1]?.text ?? "", scope: enclosingBlock(tokens, at) },
    ];
  });
}

function comparisonAt(
  { list }: Tokens,
  at: number,
  path: string,
): Found | undefined {
  const text = (offset: number) => list[at + offset]?.text ?? "";
  const isRequestPath =
    matches(list, at, [path]) && !matches(list, at - 1, [MEMBER]);
  if (isRequestPath && matches(list, at + 1, [EQUALS, STRING]))
    return { id: text(2), at };
  const subject = isRequestPath || matches(list, at, ["pathname"]);
  if (subject && matches(list, at + 1, [".", "startsWith", "(", STRING]))
    return { id: `${text(4)}*`, at };
  const tested = [REGEX_LITERAL, ".", ["exec", "test"], "(", path, ")"];
  return matches(list, at, tested) ? { id: text(0), at } : undefined;
}

interface Branch {
  readonly conditionBrackets: ExclusiveSpan;
  readonly conditionAndBody: ExclusiveSpan;
  readonly methods: readonly string[];
  readonly upgrades: boolean;
}

function branches(tokens: Tokens): Branch[] {
  const { list, pair } = tokens;
  return list.flatMap((_, at) => {
    const close = pair.get(at + 1);
    if (!matches(list, at, ["if", "("]) || close === undefined) return [];
    const end = matches(list, close + 1, ["{"])
      ? after(tokens, close + 1)
      : statementEnd(tokens, close + 1);
    const between = (start: number, stop: number) =>
      Array.from({ length: stop - start }, (__, offset) => start + offset);
    const methods = between(at + 1, close)
      .filter((index) => matches(list, index, ["method", EQUALS, STRING]))
      .map((index) => list[index + 2]?.text ?? "");
    const upgrades = between(close, end).some((index) =>
      matches(list, index, [".", "upgrade", "("]),
    );
    return [
      {
        conditionBrackets: [at + 1, close],
        conditionAndBody: [at + 1, end],
        methods,
        upgrades,
      },
    ];
  });
}

function upgradeSpans(tokens: Tokens, all: readonly Branch[]): ExclusiveSpan[] {
  const { list } = tokens;
  const upgrading = all.filter(({ upgrades }) => upgrades);
  const flags = new Set(
    upgrading.flatMap(({ conditionBrackets: [open, close] }) =>
      close - open === 2 ? [list[open + 1]?.text ?? ""] : [],
    ),
  );
  const flagged = list.flatMap((token, at): ExclusiveSpan[] =>
    matches(list, at, ["const", NAME, "="]) &&
    flags.has(list[at + 1]?.text ?? "")
      ? [[at, statementEnd(tokens, at + 3)]]
      : [],
  );
  return [
    ...upgrading.map(({ conditionBrackets }) => conditionBrackets),
    ...flagged,
  ];
}

export function serviceRoutes(file: SourceFile): ServiceRoute[] {
  const tokens = scriptTokens(file);
  const all = branches(tokens);
  const sockets = upgradeSpans(tokens, all);
  const routes = new Map<
    string,
    { line: number; methods: Set<string>; websocket: boolean }
  >();
  const found = pathVariables(tokens).flatMap(({ name, scope }) =>
    tokens.list.flatMap((_, at) => {
      const hit = within(at, scope)
        ? comparisonAt(tokens, at, name)
        : undefined;
      return hit === undefined ? [] : [hit];
    }),
  );
  for (const { id, at } of found) {
    const route = routes.get(id) ?? {
      line: tokens.list[at]?.line ?? 0,
      methods: new Set<string>(),
      websocket: false,
    };
    for (const { conditionAndBody, methods } of all)
      if (within(at, conditionAndBody))
        for (const method of methods) route.methods.add(method);
    route.websocket ||= sockets.some((span) => within(at, span));
    routes.set(id, route);
  }
  return byId(
    [...routes].map(([id, { line, methods, websocket }]) => ({
      id,
      kind: "service-route" as const,
      source: place(file.path, line),
      ...(methods.size > 0 ? { methods: [...methods].sort() } : {}),
      websocket,
    })),
  );
}
