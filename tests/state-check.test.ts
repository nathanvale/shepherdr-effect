import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileText, type StatePath, validFiles } from "./state-file-fixtures.ts";
import { testFolder } from "./support/test-folder.ts";

const ROOT = resolve(import.meta.dir, "..");
const TASKS = ".local/share/shepherdr/tasks";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function stateRoot(
  contentOrTextByPath: Readonly<Record<StatePath, unknown>>,
) {
  const root = testFolder("state-check-test-");
  roots.push(root);
  for (const [path, content] of Object.entries(contentOrTextByPath)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    const text =
      typeof content === "string" ? content : fileText(path, content);
    await writeFile(join(root, path), text);
  }
  return root;
}

function stateCheck(...args: string[]) {
  const result = Bun.spawnSync(
    [process.execPath, "run", "src/cli.ts", "state", "check", ...args],
    { cwd: ROOT, stderr: "pipe", stdout: "pipe" },
  );
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

function envelope(stdout: string) {
  expect(stdout.trim().split("\n")).toHaveLength(1);
  const value: unknown = JSON.parse(stdout);
  return value as { message: string; result: Record<string, unknown> };
}

test("a root where every file reads and writes back unchanged succeeds", async () => {
  const root = await stateRoot(validFiles);
  const total = Object.keys(validFiles).length;
  const observed = stateCheck("--dir", root, "--json");

  expect(observed.stderr).toBe("");
  expect(observed.exitCode).toBe(0);
  const { message, result } = envelope(observed.stdout);
  expect(message).toStartWith(`${total} of ${total} state files ok (`);
  expect(result).toMatchObject({
    causeCode: "SUCCESS_UNCHANGED",
    commandIdentity: "shepherdr.state.check",
    effectClass: "inspect",
    exitCode: 0,
    failureClass: null,
    outcome: "success",
    transactionState: "unchanged",
    data: {
      root,
      families: expect.arrayContaining([
        { family: "task-lists", files: 2 },
        { family: "attempts", files: 2 },
        { family: "herdr-core", files: 2 },
      ]) as unknown,
    },
  });
});

test("a root with failing files fails and says why for each, without their contents", async () => {
  const scheduler = `${TASKS}/.scheduler.json`;
  const root = await stateRoot({
    [scheduler]: validFiles[scheduler],
    [`${TASKS}/.tick.lock`]: "private-lock-words",
    [`${TASKS}/.reactions.json`]: { mtime: "private-value", at: 1 },
    [`${TASKS}/.held.json`]: {
      "private-address": [{ text: "x", how: "send", at: 1, from: "private" }],
    },
    ".config/shepherdr/model-picks.json": "private words, not JSON",
  });
  const observed = stateCheck("--dir", root, "--json");

  expect(observed.stderr).toBe("");
  expect(observed.exitCode).toBe(4);
  expect(observed.stdout).not.toContain("private");
  const lines = [
    ".config/shepherdr/model-picks.json: decode failed: (root) Expected a JSON document",
    `${TASKS}/.held.json: round trip differs: /*/0/from`,
    `${TASKS}/.reactions.json: decode failed: /mtime Expected number`,
    `${TASKS}/.tick.lock: no schema`,
  ];
  const { message, result } = envelope(observed.stdout);
  expect(message).toBe(
    ["4 of 5 state files did not pass.", ...lines].join("\n"),
  );
  expect(result).toMatchObject({
    causeCode: "SCHEMA_STATE_FILE_MISMATCH",
    commandIdentity: "shepherdr.state.check",
    data: null,
    effectClass: "inspect",
    exitCode: 4,
    failureClass: "schema",
    handoff: {
      owner: "operator",
      reason: "4 of 5 state files did not pass.",
      inspect: lines,
    },
    outcome: "failed",
    retryable: false,
    transactionState: "unchanged",
  });
  expect(result).not.toHaveProperty("nextAction");
});

test("a file that breaks its schema in many places names the first few", async () => {
  const usage = ".local/state/shepherdr/service/usage.jsonl";
  const root = await stateRoot({
    [usage]: Array.from({ length: 12 }, () => ({ at: 1, kind: "unknown" })),
  });
  const observed = stateCheck("--dir", root);

  expect(observed.exitCode).toBe(4);
  const [headline, line, ...rest] = observed.stdout.trimEnd().split("\n");
  expect(headline).toBe("1 of 1 state files did not pass.");
  expect(line).toStartWith(`${usage}: decode failed: line 1 /kind Expected `);
  expect(line).toEndWith("; and 4 more");
  expect(rest).toEqual([]);
});

test("the human form says how many files of each family passed", async () => {
  const root = await stateRoot(validFiles);
  const observed = stateCheck("--dir", root);

  expect(observed.exitCode).toBe(0);
  expect(observed.stderr).toBe("");
  expect(observed.stdout).toMatch(
    /^\d+ of \d+ state files ok \(.*task-lists 2.*\)\.\n$/,
  );
});

for (const [name, args] of [
  ["no folder", []],
  ["a folder without --dir", ["somewhere"]],
  ["a word after the folder", ["--dir", "somewhere", "extra"]],
] as const) {
  test(`${name} is a usage refusal`, () => {
    const observed = stateCheck(...args, "--json");

    expect(observed.exitCode).toBe(2);
    expect(envelope(observed.stdout).result).toMatchObject({
      causeCode: "USAGE_INVALID_INVOCATION",
      commandIdentity: "shepherdr.state.check",
      data: null,
      failureClass: "usage",
      outcome: "refused",
      repairAction: "Pass --dir with one folder path and retry.",
      transactionState: "unchanged",
    });
  });
}

test("a root that is missing or empty is refused", async () => {
  const empty = await stateRoot({});
  for (const [root, causeCode] of [
    [join(empty, "missing"), "DOMAIN_STATE_ROOT_UNREADABLE"],
    [empty, "DOMAIN_STATE_ROOT_EMPTY"],
  ] as const) {
    const observed = stateCheck("--dir", root, "--json");

    expect(observed.exitCode).toBe(3);
    expect(envelope(observed.stdout).result).toMatchObject({
      causeCode,
      data: null,
      failureClass: "domain",
      outcome: "refused",
    });
  }
});
