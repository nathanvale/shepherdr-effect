import { expect, test } from "bun:test";
import { pythonTokens, scriptTokens } from "../src/inventory/tokens.ts";

const source = (text: string) => ({ path: "fork/source", text });

test("script tokens: a comment is dropped, and a bracket or quote inside it reads as nothing", () => {
  const { list } = scriptTokens(source("call(1) // ) ' \"\n/* ( */ end"));

  expect(list.map(({ text }) => text)).toEqual(["call", "(", "1", ")", "end"]);
});

test("script tokens: a string's text is what stands between its quotes, as written", () => {
  const { list } = scriptTokens(
    source(String.raw`a("x\ny", 'z', ` + "`t${1}`)"),
  );

  expect(
    list.filter(({ kind }) => kind === "string").map(({ text }) => text),
  ).toEqual([String.raw`x\ny`, "z", "t${1}"]);
});

test("script tokens: a regex keeps its slashes and flags, and a division is not one", () => {
  const { list } = scriptTokens(source(String.raw`x = /a\/b/g; y = a / b / c`));

  expect(
    list.filter(({ kind }) => kind === "regex").map(({ text }) => text),
  ).toEqual([String.raw`/a\/b/g`]);
});

test("python tokens: a string is one token whatever it holds, and a comment is dropped", () => {
  const { list } = pythonTokens(
    source("x = '''a # (b \"\n'''  # ( note\ny = 'q'"),
  );

  expect(list.map(({ kind, text }) => [kind, text])).toEqual([
    ["name", "x"],
    ["punct", "="],
    ["string", 'a # (b "\n'],
    ["name", "y"],
    ["punct", "="],
    ["string", "q"],
  ]);
});
