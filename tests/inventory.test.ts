import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stateFiles } from "../src/state-files/registry.ts";
import {
  ACTIONS,
  CLI,
  DIAGRAM,
  diagramText,
  forkCheckoutFiles,
  MAIN,
} from "./inventory-fixtures.ts";

const CLI_FILE = resolve(import.meta.dir, "../src/cli.ts");
const roots: string[] = [];

/** What the made-up fork holds, by list, as the extractor tests prove item by item. */
const COUNTS = {
  "herdr-task-commands": 12,
  "service-routes": 10,
  "service-actions": 10,
  "core-rpc-methods": 5,
  "hc-cli-subcommands": 9,
  "terminal-labels": 6,
  "diagram-elements": 10,
};
const LISTS = Object.keys(COUNTS);
const FILES = LISTS.map((list) => `inventory/${list}.json`).sort();

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function folderOf(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), "inventory-test-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

/** A fork folder, and a repository folder that holds only the diagram. */
async function folders(
  fork: Readonly<Record<string, string>> = forkCheckoutFiles,
) {
  return {
    fork: await folderOf(fork),
    repository: await folderOf({ [DIAGRAM]: diagramText }),
  };
}

/** Runs the CLI inside a repository folder, as `bun run start` does from this one. */
function inventory(repository: string, ...args: string[]) {
  const result = Bun.spawnSync(
    [process.execPath, "run", CLI_FILE, "inventory", ...args, "--json"],
    { cwd: repository, stderr: "pipe", stdout: "pipe" },
  );
  const stdout = result.stdout.toString();
  expect(result.stderr.toString()).toBe("");
  expect(stdout.trim().split("\n")).toHaveLength(1);
  const value: unknown = JSON.parse(stdout);
  const envelope = value as {
    message: string;
    result: Record<string, unknown> & {
      effects: { completed: string[]; uncertain: string[] };
    };
  };
  return { exitCode: result.exitCode, ...envelope };
}

async function filesUnder(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      paths.map(
        async (path) =>
          [path.slice(root.length + 1), await readFile(path, "utf8")] as const,
      ),
    ),
  );
}

async function ids(repository: string, list: string): Promise<string[]> {
  const text = await readFile(
    join(repository, `inventory/${list}.json`),
    "utf8",
  );
  const items = JSON.parse(text) as { id: string }[];
  return items.map(({ id }) => id);
}

test("extract keeps one file for each list, in id order, and writes nowhere else", async () => {
  const { fork, repository } = await folders();
  const observed = inventory(repository, "extract", "--fork", fork);

  expect(observed.exitCode).toBe(0);
  expect(observed.message).toBe(
    `Extracted 7 lists (${Object.entries(COUNTS)
      .map(([list, items]) => `${list} ${String(items)}`)
      .join(", ")}). Wrote 7 of 7 files under inventory/.`,
  );
  expect(observed.result).toMatchObject({
    causeCode: "SUCCESS_COMPLETED",
    commandIdentity: "example.inventory.extract",
    effectClass: "repository-local",
    effects: { completed: FILES, remaining: [], uncertain: [] },
    outcome: "success",
    transactionState: "completed",
    data: {
      fork,
      lists: Object.entries(COUNTS).map(([list, items]) => ({
        list,
        items,
        file: `inventory/${list}.json`,
        written: true,
      })),
    },
  });
  const kept = await filesUnder(repository);
  expect(Object.keys(kept)).toEqual([DIAGRAM, ...FILES].sort());
  for (const file of FILES) {
    const text = kept[file] ?? "";
    const items = JSON.parse(text) as { id: string }[];
    const order = items.map(({ id }) => id);
    expect(text).toBe(`${JSON.stringify(items, null, 2)}\n`);
    expect(order).toEqual([...order].sort());
  }
  expect(await filesUnder(fork)).toEqual(forkCheckoutFiles);
});

test("extract never reads a test file, and a second extract changes nothing", async () => {
  const { fork, repository } = await folders();
  inventory(repository, "extract", "--fork", fork);
  const first = await filesUnder(repository);
  const again = inventory(repository, "extract", "--fork", fork);

  expect(JSON.stringify(first)).not.toContain("testonly");
  expect(JSON.stringify(first)).not.toContain("test.only");
  expect(again.exitCode).toBe(0);
  expect(again.message).toEndWith("Nothing under inventory/ changed.");
  expect(again.result).toMatchObject({
    causeCode: "SUCCESS_UNCHANGED",
    effects: { completed: [] },
    transactionState: "unchanged",
  });
  expect(await filesUnder(repository)).toEqual(first);
});

test("extract refuses a folder that is not the fork, and writes nothing", async () => {
  const { repository } = await folders();
  const withoutCli = Object.fromEntries(
    Object.entries(forkCheckoutFiles).filter(([path]) => path !== CLI),
  );
  const cases = [
    await folderOf({ "README.md": "not a fork" }),
    await folderOf(withoutCli),
  ];
  for (const fork of cases) {
    const observed = inventory(repository, "extract", "--fork", fork);

    expect(observed.exitCode).toBe(3);
    expect(observed.result).toMatchObject({
      causeCode: "DOMAIN_FORK_UNREADABLE",
      effectClass: "repository-local",
      failureClass: "domain",
      outcome: "refused",
      transactionState: "unchanged",
    });
  }
  expect(Object.keys(await filesUnder(repository))).toEqual([DIAGRAM]);
});

test("extract that cannot write says its files are uncertain, not unchanged", async () => {
  const fork = await folderOf(forkCheckoutFiles);
  const repository = await folderOf({
    [DIAGRAM]: diagramText,
    inventory: "a file where the folder should be",
  });
  const observed = inventory(repository, "extract", "--fork", fork);

  expect(observed.exitCode).toBe(1);
  expect(observed.result).toMatchObject({
    effects: { completed: [], uncertain: FILES },
    failureClass: "internal",
    outcome: "failed",
    transactionState: "unknown",
  });
  expect(observed.result).not.toHaveProperty("nextAction");
});

test("check passes on what extract kept, with and without the fork", async () => {
  const { fork, repository } = await folders();
  inventory(repository, "extract", "--fork", fork);
  const before = await filesUnder(repository);
  const lists = Object.entries(COUNTS).map(([list, items]) => ({
    list,
    items,
    file: `inventory/${list}.json`,
  }));
  const registry = { items: stateFiles.length };

  const alone = inventory(repository, "check");
  expect(alone.exitCode).toBe(0);
  expect(alone.message).toStartWith("7 of 7 inventory lists ok (");
  expect(alone.message).not.toContain("match the fork");
  expect(alone.result).toMatchObject({
    causeCode: "SUCCESS_UNCHANGED",
    commandIdentity: "example.inventory.check",
    effectClass: "inspect",
    transactionState: "unchanged",
    data: { fork: null, lists, stateFiles: registry },
  });

  const compared = inventory(repository, "check", "--fork", fork);
  expect(compared.exitCode).toBe(0);
  expect(compared.message).toEndWith("They match the fork.");
  expect(compared.result).toMatchObject({ data: { fork, lists } });
  expect(await filesUnder(repository)).toEqual(before);
});

test("check with the fork names each stale list and the ids that differ", async () => {
  const { fork, repository } = await folders();
  inventory(repository, "extract", "--fork", fork);
  const before = await filesUnder(repository);
  const main = (forkCheckoutFiles[MAIN] ?? "")
    .replace(
      'if (path === "/api/health")',
      'if (path === "/api/added") return json({}); if (path === "/api/health" && req.method === "GET")',
    )
    .replace('if (body?.type === "usage") return json({ ok: true });', "");
  await writeFile(join(fork, MAIN), main);

  const observed = inventory(repository, "check", "--fork", fork);
  const lines = [
    "service-routes: missing: /api/added; changed: /api/health",
    "service-actions: gone from the fork: usage",
  ];
  expect(observed.exitCode).toBe(3);
  expect(observed.message).toBe(
    ["2 of 7 inventory lists differ from the fork.", ...lines].join("\n"),
  );
  expect(observed.result).toMatchObject({
    causeCode: "DOMAIN_INVENTORY_STALE",
    data: null,
    failureClass: "domain",
    handoff: { owner: "operator", inspect: lines },
    outcome: "failed",
    transactionState: "unchanged",
  });
  // The kept files are judged, never repaired: without the fork they still pass.
  expect(await filesUnder(repository)).toEqual(before);
  expect(inventory(repository, "check").exitCode).toBe(0);
});

test("check fails on a kept file that breaks its schema, and says where for each", async () => {
  const { fork, repository } = await folders();
  inventory(repository, "extract", "--fork", fork);
  const kept = (list: string) => join(repository, `inventory/${list}.json`);
  const rewrite = async (list: string, change: (items: object[]) => unknown) =>
    writeFile(
      kept(list),
      JSON.stringify(
        change(JSON.parse(await readFile(kept(list), "utf8")) as object[]),
      ),
    );
  await rewrite("service-routes", ([first, ...rest]) => [
    { ...first, websocket: "no", extra: true },
    ...rest,
  ]);
  await rewrite("service-actions", (items) => [...items].reverse());
  await rewrite("terminal-labels", ([first, ...rest]) => [
    { ...first, kind: "label", source: "nowhere" },
    ...rest,
  ]);
  await writeFile(kept("core-rpc-methods"), "not JSON");
  await rm(kept("diagram-elements"));
  await writeFile(kept("state-files"), "[]\n");

  const observed = inventory(repository, "check", "--fork", fork);
  const handoff = observed.result.handoff as { inspect: string[] };
  const lines = handoff.inspect;
  expect(observed.exitCode).toBe(4);
  expect(observed.message).toBe(
    ["6 inventory files did not pass.", ...lines].join("\n"),
  );
  expect(observed.result).toMatchObject({
    causeCode: "SCHEMA_INVENTORY_MISMATCH",
    data: null,
    effectClass: "inspect",
    failureClass: "schema",
    handoff: { owner: "operator" },
    outcome: "failed",
  });
  expect(lines).toHaveLength(6);
  // A key no list names, and a value of the wrong type, each at its place.
  expect(lines[0]).toStartWith("inventory/service-routes.json: ");
  expect(lines[0]).toContain("/0/extra ");
  expect(lines[0]).toContain("/0/websocket ");
  expect(lines[1]).toBe(
    "inventory/service-actions.json: / Expected items in id order, each id once",
  );
  expect(lines[2]).toBe("inventory/core-rpc-methods.json: not a JSON document");
  expect(lines[3]).toStartWith("inventory/terminal-labels.json: ");
  expect(lines[3]).toContain("/0/kind ");
  expect(lines[3]).toContain("/0/source ");
  expect(lines[4]).toBe("inventory/diagram-elements.json: missing");
  expect(lines[5]).toBe("inventory/state-files.json: no list has this name");
});

test("a kept list that drifted in many items names the first few", async () => {
  const { fork, repository } = await folders();
  inventory(repository, "extract", "--fork", fork);
  const kept = await ids(repository, "herdr-task-commands");
  // One more line at the top: every command now stands a line lower.
  await writeFile(join(fork, CLI), `# moved\n${forkCheckoutFiles[CLI] ?? ""}`);

  const observed = inventory(repository, "check", "--fork", fork);

  expect(kept).toHaveLength(12);
  expect(observed.exitCode).toBe(3);
  expect(observed.message).toBe(
    [
      "1 of 7 inventory lists differ from the fork.",
      `herdr-task-commands: changed: ${kept.slice(0, 8).join(", ")}, and 4 more`,
    ].join("\n"),
  );
});

for (const [name, command, args] of [
  ["extract with no fork", "extract", []],
  ["extract with a bare folder", "extract", ["somewhere"]],
  ["extract with a word after the fork", "extract", ["--fork", "a", "b"]],
  ["check with a bare folder", "check", ["somewhere"]],
  ["check with --fork and no folder", "check", ["--fork"]],
] as const) {
  test(`${name} is a usage refusal`, async () => {
    const { repository } = await folders();
    const observed = inventory(repository, command, ...args);

    expect(observed.exitCode).toBe(2);
    expect(observed.result).toMatchObject({
      causeCode: "USAGE_INVALID_INVOCATION",
      commandIdentity: `example.inventory.${command}`,
      data: null,
      failureClass: "usage",
      outcome: "refused",
      transactionState: "unchanged",
    });
    expect(Object.keys(await filesUnder(repository))).toEqual([DIAGRAM]);
  });
}

test("check with a fork that cannot be read is refused, after the kept files pass", async () => {
  const { fork, repository } = await folders();
  inventory(repository, "extract", "--fork", fork);
  await rm(join(fork, ACTIONS));

  const observed = inventory(repository, "check", "--fork", fork);

  expect(observed.exitCode).toBe(3);
  expect(observed.message).toContain(`${ACTIONS} is missing from the fork.`);
  expect(observed.result).toMatchObject({
    causeCode: "DOMAIN_FORK_UNREADABLE",
    commandIdentity: "example.inventory.check",
    outcome: "refused",
  });
});
