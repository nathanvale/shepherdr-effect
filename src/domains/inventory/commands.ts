import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Result, Schema, SchemaIssue } from "effect";
import type { OperationResult } from "../../commands-contract.ts";
import { DIAGRAM, readSources } from "./fork.ts";
import { type List, lists } from "./lists.ts";
import type { Item } from "./source.ts";
import { stateFileItems } from "./state-files.ts";

const FOLDER = "inventory";
// A list can differ in every item: a few ids say enough.
const SHOWN = 8;

type Command = Pick<OperationResult, "commandIdentity" | "effectClass"> & {
  readonly usage: string;
};

const EXTRACT: Command = {
  commandIdentity: "example.inventory.extract",
  effectClass: "repository-local",
  usage: "inventory extract --fork PATH",
};
const CHECK: Command = {
  commandIdentity: "example.inventory.check",
  effectClass: "inspect",
  usage: "inventory check [--fork PATH]",
};

/** A step of a command: its value, or the result the command ends with instead. */
type Step<Value> = Effect.Effect<Value, OperationResult>;

/** One list with its items: read from the fork, or from its kept file. */
interface Listed {
  readonly list: List;
  readonly items: readonly Item[];
}

const fileOf = (list: List) => `${FOLDER}/${list.name}.json`;
const render = (items: readonly Item[]) =>
  `${JSON.stringify(items, null, 2)}\n`;
const why = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const counts = (listed: readonly Listed[]) =>
  listed
    .map(({ list, items }) => `${list.name} ${String(items.length)}`)
    .join(", ");

function settle(step: Step<OperationResult>): Promise<OperationResult> {
  const either = { onFailure: same, onSuccess: same };
  return Effect.runPromise(Effect.match(step, either));
}

function same(result: OperationResult): OperationResult {
  return result;
}

function unchanged({ commandIdentity, effectClass }: Command) {
  return {
    commandIdentity,
    effectClass,
    effects: {
      completed: [],
      remaining: [],
      uncertain: [],
      inventoryComplete: true,
    },
    retryable: false,
    transactionState: "unchanged",
  } satisfies Partial<OperationResult>;
}

function refused(
  command: Command,
  failure: "usage" | "domain",
  causeCode: string,
  message: string,
  repairAction: string,
): OperationResult {
  return {
    ...unchanged(command),
    causeCode,
    data: null,
    exitCode: failure === "usage" ? 2 : 3,
    failureClass: failure,
    message,
    nextAction: `Run ${command.usage}.`,
    outcome: "refused",
    repairAction,
  };
}

/** The kept files were looked at and found wrong: the lines say what, one for each list or file. */
function failed(
  failure: "domain" | "schema",
  causeCode: string,
  headline: string,
  lines: readonly string[],
  repairAction: string,
): OperationResult {
  return {
    ...unchanged(CHECK),
    causeCode,
    data: null,
    exitCode: failure === "schema" ? 4 : 3,
    failureClass: failure,
    handoff: { owner: "operator", reason: headline, inspect: [...lines] },
    message: [headline, ...lines].join("\n"),
    outcome: "failed",
    repairAction,
  };
}

function shortened(ids: readonly string[]): string {
  const more = ids.length - SHOWN;
  const shown = ids.slice(0, SHOWN).join(", ");
  return more > 0 ? `${shown}, and ${String(more)} more` : shown;
}

/** `--fork PATH` and nothing else names a fork. No words at all names none. Anything else is not understood. */
function forkOption(
  args: readonly string[],
): { readonly fork: string | undefined } | undefined {
  if (args.length === 0) return { fork: undefined };
  return args.length === 2 && args[0] === "--fork"
    ? { fork: args[1] }
    : undefined;
}

/** Every list, read fresh from the fork. Nothing is written. */
function readFresh(
  command: Command,
  fork: string,
  repository: string,
): Step<Listed[]> {
  return Effect.tryPromise({
    try: async () => {
      const sources = await readSources(fork, repository);
      return lists.map((list) => ({ list, items: list.extract(sources) }));
    },
    catch: (cause) =>
      refused(
        command,
        "domain",
        "DOMAIN_FORK_UNREADABLE",
        `The lists could not be read from the fork: ${why(cause)}`,
        `Pass the folder that holds the old system's source, keep ${DIAGRAM} in this repository, and retry.`,
      ),
  });
}

async function textOf(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** The files that do not hold their list's text yet, with that text. A second run of the same extract finds none. */
async function differing(repository: string, listed: readonly Listed[]) {
  const wanted = listed.map(({ list, items }) => ({
    file: fileOf(list),
    text: render(items),
  }));
  const current = await Promise.all(
    wanted.map(({ file }) => textOf(join(repository, file))),
  );
  return wanted.filter(({ text }, at) => current[at] !== text);
}

async function write(
  repository: string,
  changed: readonly { readonly file: string; readonly text: string }[],
) {
  await mkdir(join(repository, FOLDER), { recursive: true });
  for (const { file, text } of changed)
    await writeFile(join(repository, file), text);
}

/** A write that stopped part way: which of these files changed is not known here. */
function writeFailed(files: string[], cause: unknown): OperationResult {
  const reason = `The inventory files could not all be written: ${why(cause)}`;
  return {
    ...unchanged(EXTRACT),
    causeCode: "INTERNAL_INVENTORY_WRITE_UNKNOWN",
    data: null,
    effects: {
      completed: [],
      remaining: [],
      uncertain: files,
      inventoryComplete: true,
    },
    exitCode: 1,
    failureClass: "internal",
    handoff: {
      owner: "operator",
      reason,
      inspect: [`Run git status ${FOLDER}/ to see which files changed.`],
    },
    message: reason,
    outcome: "failed",
    repairAction: `Make ${FOLDER}/ a folder that can be written, then run inventory extract again: it writes only the files that differ.`,
    transactionState: "unknown",
  };
}

const WROTE_NOTHING = {
  causeCode: "SUCCESS_UNCHANGED",
  nextAction: "No follow-up is required.",
  transactionState: "unchanged",
} as const;
const WROTE_FILES = {
  causeCode: "SUCCESS_COMPLETED",
  nextAction: `Review the diff under ${FOLDER}/ and commit it.`,
  transactionState: "completed",
} as const;

function extractedResult(
  fork: string,
  listed: readonly Listed[],
  written: string[],
): OperationResult {
  const total = String(listed.length);
  const wrote = written.length > 0;
  const files = wrote
    ? `Wrote ${String(written.length)} of ${total} files under ${FOLDER}/.`
    : `Nothing under ${FOLDER}/ changed.`;
  return {
    ...unchanged(EXTRACT),
    ...(wrote ? WROTE_FILES : WROTE_NOTHING),
    data: {
      fork,
      lists: listed.map(({ list, items }) => ({
        list: list.name,
        items: items.length,
        file: fileOf(list),
        written: written.includes(fileOf(list)),
      })),
    },
    effects: {
      completed: written,
      remaining: [],
      uncertain: [],
      inventoryComplete: true,
    },
    exitCode: 0,
    failureClass: null,
    message: `Extracted ${total} lists (${counts(listed)}). ${files}`,
    outcome: "success",
    repairAction: null,
  };
}

/**
 * Reads every list from the old system's source and keeps each as
 * `inventory/<list>.json` in the folder the command runs in. Only a file
 * whose text would differ is written, and nothing outside `inventory/` is.
 */
export function extractInventory(
  args: readonly string[],
): Promise<OperationResult> {
  const repository = process.cwd();
  const fork = forkOption(args)?.fork;
  if (fork === undefined)
    return Promise.resolve(
      refused(
        EXTRACT,
        "usage",
        "USAGE_INVALID_INVOCATION",
        "inventory extract takes --fork PATH and nothing else.",
        "Pass --fork with the old system's folder and retry.",
      ),
    );
  return settle(
    Effect.gen(function* () {
      const listed = yield* readFresh(EXTRACT, fork, repository);
      const changed = yield* Effect.promise(() =>
        differing(repository, listed),
      );
      const files = changed.map(({ file }) => file).sort();
      yield* Effect.tryPromise({
        try: () => write(repository, changed),
        catch: (cause) => writeFailed(files, cause),
      });
      return extractedResult(fork, listed, files);
    }),
  );
}

const describe = SchemaIssue.makeFormatterStandardSchemaV1();

function parsed(text: string): { readonly document: unknown } | undefined {
  try {
    const document: unknown = JSON.parse(text);
    return { document };
  } catch {
    return undefined;
  }
}

/** A list's kept file: its items, or what is wrong with it. */
type Kept = { readonly list: List } & (
  | { readonly items: readonly Item[] }
  | { readonly problem: string }
);

/** A document read through a list's schema. A key the schema does not name breaks it, as a wrong value does. */
async function decoded(list: List, document: unknown): Promise<Kept> {
  const strict = { errors: "all", onExcessProperty: "error" } as const;
  const result = await Effect.runPromise(
    Effect.result(Schema.decodeUnknownEffect(list.schema, strict)(document)),
  );
  if (Result.isSuccess(result)) return { list, items: result.success };
  const places = describe(result.failure.issue).issues.map(
    ({ path = [], message }) => `/${path.map(String).join("/")} ${message}`,
  );
  return { list, problem: shortened(places) };
}

async function kept(repository: string, list: List): Promise<Kept> {
  const text = await textOf(join(repository, fileOf(list)));
  if (text === undefined) return { list, problem: "missing" };
  const json = parsed(text);
  return json === undefined
    ? { list, problem: "not a JSON document" }
    : decoded(list, json.document);
}

/** Files in the inventory folder that belong to no list. */
async function strays(repository: string): Promise<string[]> {
  const known = new Set(lists.map((list) => `${list.name}.json`));
  const names = await readdir(join(repository, FOLDER)).catch(() => []);
  return names.filter((name) => name.endsWith(".json") && !known.has(name));
}

/** Every kept list, read through its schema. One file that is missing, broken or unknown fails them all. */
function keptLists(repository: string): Step<Listed[]> {
  return Effect.gen(function* () {
    const files = yield* Effect.promise(() =>
      Promise.all(lists.map((list) => kept(repository, list))),
    );
    const unknown = yield* Effect.promise(() => strays(repository));
    const problems = [
      ...files.flatMap((file) =>
        "problem" in file ? [`${fileOf(file.list)}: ${file.problem}`] : [],
      ),
      ...unknown.map((name) => `${FOLDER}/${name}: no list has this name`),
    ];
    if (problems.length > 0)
      return yield* Effect.fail(
        failed(
          "schema",
          "SCHEMA_INVENTORY_MISMATCH",
          `${String(problems.length)} inventory files did not pass.`,
          problems,
          "Run inventory extract --fork PATH to write the lists again, or correct the schema in src/domains/inventory/lists.ts.",
        ),
      );
    return files.flatMap((file) =>
      "items" in file ? [{ list: file.list, items: file.items }] : [],
    );
  });
}

/** An item as one text that is the same however its keys are ordered. */
const fingerprint = (item: Item) =>
  JSON.stringify(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)));

const byFingerprint = (items: readonly Item[]) =>
  new Map(items.map((item) => [item.id, fingerprint(item)]));

/** How a kept list differs from the same list read fresh, by id. Nothing when it does not. */
function staleness(kept: readonly Item[], fresh: readonly Item[]): string[] {
  const was = byFingerprint(kept);
  const now = byFingerprint(fresh);
  const groups: [string, string[]][] = [
    ["missing", [...now.keys()].filter((id) => !was.has(id))],
    ["gone from the fork", [...was.keys()].filter((id) => !now.has(id))],
    [
      "changed",
      [...now.keys()].filter(
        (id) => was.has(id) && was.get(id) !== now.get(id),
      ),
    ],
  ];
  return groups
    .filter(([, ids]) => ids.length > 0)
    .map(([what, ids]) => `${what}: ${shortened(ids)}`);
}

/** Fails when a kept list no longer says what the fork says, naming each such list and the ids that differ. */
function matchFork(
  fork: string,
  repository: string,
  kept: readonly Listed[],
): Step<void> {
  return Effect.gen(function* () {
    const fresh = yield* readFresh(CHECK, fork, repository);
    const stale = kept.flatMap(({ list, items }, at) => {
      const differences = staleness(items, fresh[at]?.items ?? []);
      return differences.length > 0
        ? [`${list.name}: ${differences.join("; ")}`]
        : [];
    });
    if (stale.length > 0)
      return yield* Effect.fail(
        failed(
          "domain",
          "DOMAIN_INVENTORY_STALE",
          `${String(stale.length)} of ${String(kept.length)} inventory lists differ from the fork.`,
          stale,
          "Run inventory extract --fork PATH, review the diff and commit inventory/.",
        ),
      );
  });
}

function checkedResult(
  kept: readonly Listed[],
  fork: string | undefined,
): OperationResult {
  const total = String(kept.length);
  const stateFiles = stateFileItems().length;
  const matches = fork === undefined ? "" : " They match the fork.";
  return {
    ...unchanged(CHECK),
    causeCode: "SUCCESS_UNCHANGED",
    data: {
      fork: fork ?? null,
      lists: kept.map(({ list, items }) => ({
        list: list.name,
        items: items.length,
        file: fileOf(list),
      })),
      // Not a file: the registry is the one list of state files.
      stateFiles: { items: stateFiles, from: "src/state-files/registry.ts" },
    },
    exitCode: 0,
    failureClass: null,
    message: `${total} of ${total} inventory lists ok (${counts(kept)}), beside ${String(stateFiles)} state files in the registry.${matches}`,
    nextAction: "No follow-up is required.",
    outcome: "success",
    repairAction: null,
  };
}

/**
 * Proves the kept inventory in the folder the command runs in: every list
 * has its file, and each file reads through its schema. With `--fork`, each
 * list is also read from the fork again and compared, so a list that no
 * longer matches the fork fails by name, with the ids that differ.
 */
export function checkInventory(
  args: readonly string[],
): Promise<OperationResult> {
  const repository = process.cwd();
  const option = forkOption(args);
  if (option === undefined)
    return Promise.resolve(
      refused(
        CHECK,
        "usage",
        "USAGE_INVALID_INVOCATION",
        "inventory check takes --fork PATH or nothing.",
        "Pass nothing, or --fork with the old system's folder, and retry.",
      ),
    );
  const { fork } = option;
  return settle(
    Effect.gen(function* () {
      const kept = yield* keptLists(repository);
      if (fork !== undefined) yield* matchFork(fork, repository, kept);
      return checkedResult(kept, fork);
    }),
  );
}
