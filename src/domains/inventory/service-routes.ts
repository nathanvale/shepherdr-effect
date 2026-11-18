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

/** `id` is the path as compared: exact, a prefix ending in `*`, or the regex it is tested with. */
export const ServiceRoute = Schema.Struct({
  ...itemFields("service-route"),
  /** The methods the code compares beside this path, when it compares any. */
  methods: Schema.optionalKey(Schema.Array(Schema.String)),
  /** True when the request is upgraded to a WebSocket. */
  websocket: Schema.Boolean,
});
export type ServiceRoute = (typeof ServiceRoute)["Type"];

/** A stretch of tokens, both ends left out. */
type Span = readonly [start: number, end: number];

interface Found {
  readonly id: string;
  readonly at: number;
}

const EQUALS = ["===", "=="];
const MEMBER = [".", "?."];
const within = (at: number, [start, end]: Span) => start < at && at < end;

/** The block a position sits in: the nearest `{` before it that is still open there. */
function enclosingBlock({ list, pair }: Tokens, at: number): Span {
  for (let index = at - 1; index >= 0; index -= 1) {
    const partner = pair.get(index);
    if (partner !== undefined && partner < index) index = partner;
    else if (partner !== undefined && matches(list, index, ["{"]))
      return [index, partner];
  }
  return [-1, list.length];
}

/** `const path = ...pathname...;`: each variable that holds the request's path, with the block it lives in. */
function pathVariables(tokens: Tokens): { name: string; scope: Span }[] {
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

/** One comparison with the path at a position, if there is one. */
function comparison(
  { list }: Tokens,
  at: number,
  path: string,
): Found | undefined {
  const text = (offset: number) => list[at + offset]?.text ?? "";
  // `a.path` is some other object's path, not the request's.
  const own = matches(list, at, [path]) && !matches(list, at - 1, [MEMBER]);
  if (own && matches(list, at + 1, [EQUALS, STRING]))
    return { id: text(2), at };
  const subject = own || matches(list, at, ["pathname"]);
  if (subject && matches(list, at + 1, [".", "startsWith", "(", STRING]))
    return { id: `${text(4)}*`, at };
  const tested = [REGEX_LITERAL, ".", ["exec", "test"], "(", path, ")"];
  return matches(list, at, tested) ? { id: text(0), at } : undefined;
}

interface Branch {
  /** The condition, from its `(` to its `)`. */
  readonly condition: Span;
  /** The condition and what it guards. */
  readonly reach: Span;
  readonly methods: readonly string[];
  readonly upgrades: boolean;
}

/** Every `if`, with the methods its condition compares and whether what it guards upgrades the request. */
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
      { condition: [at + 1, close], reach: [at + 1, end], methods, upgrades },
    ];
  });
}

/**
 * Where a comparison means a WebSocket: in the condition of an `if` that
 * upgrades, or in the statement that sets a flag such an `if` tests alone
 * (`const socket = path === "/api/ws" || ...; if (socket) return srv.upgrade(...)`).
 */
function upgradeSpans(tokens: Tokens, all: readonly Branch[]): Span[] {
  const { list } = tokens;
  const upgrading = all.filter(({ upgrades }) => upgrades);
  const flags = new Set(
    upgrading.flatMap(({ condition: [open, close] }) =>
      close - open === 2 ? [list[open + 1]?.text ?? ""] : [],
    ),
  );
  const flagged = list.flatMap((token, at): Span[] =>
    matches(list, at, ["const", NAME, "="]) &&
    flags.has(list[at + 1]?.text ?? "")
      ? [[at, statementEnd(tokens, at + 3)]]
      : [],
  );
  return [...upgrading.map(({ condition }) => condition), ...flagged];
}

/**
 * Every HTTP path and WebSocket endpoint the service's request handler
 * compares the request's path with. The handler is found by what it does: it
 * is the block that takes a variable from the URL's `pathname`.
 */
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
      const hit = within(at, scope) ? comparison(tokens, at, name) : undefined;
      return hit === undefined ? [] : [hit];
    }),
  );
  for (const { id, at } of found) {
    const route = routes.get(id) ?? {
      line: tokens.list[at]?.line ?? 0,
      methods: new Set<string>(),
      websocket: false,
    };
    for (const { reach, methods } of all)
      if (within(at, reach))
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
