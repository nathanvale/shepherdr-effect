import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Result, Schema, SchemaIssue } from "effect";
import type { CommandResult } from "../commands-contract.ts";
import { DIAGRAM_COPY_PATH, readSourcesAsText } from "./fork-checkout.ts";
import { type List, listsKeptAsFiles } from "./lists.ts";
import type { Item } from "./source.ts";
import { stateFileItemsFromRegistry } from "./state-files.ts";

const FOLDER = "inventory";
const IDS_SHOWN_PER_LIST = 8;

type Command = Pick<CommandResult, "commandIdentity" | "effectClass"> & {
  readonly usage: string;
};

const EXTRACT: Command = {
  commandIdentity: "shepherdr.inventory.extract",
  effectClass: "repository-local",
  usage: "inventory extract --fork PATH",
};
const CHECK: Command = {
  commandIdentity: "shepherdr.inventory.check",
  effectClass: "inspect",
  usage: "inventory check [--fork PATH]",
};

type CommandStep<Value> = Effect.Effect<Value, CommandResult>;

interface ListWithItems {
  readonly list: List;
  readonly items: readonly Item[];
}

const fileOf = (list: List) => `${FOLDER}/${list.name}.json`;
const render = (items: readonly Item[]) =>
  `${JSON.stringify(items, null, 2)}\n`;
const why = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const counts = (listed: readonly ListWithItems[]) =>
  listed
    .map(({ list, items }) => `${list.name} ${String(items.length)}`)
    .join(", ");

function resultOf(step: CommandStep<CommandResult>): Promise<CommandResult> {
  const either = { onFailure: same, onSuccess: same };
  return Effect.runPromise(Effect.match(step, either));
}

function same(result: CommandResult): CommandResult {
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
  } satisfies Partial<CommandResult>;
}

function refused(
  command: Command,
  failure: "usage" | "domain",
  causeCode: string,
  message: string,
  repairAction: string,
): CommandResult {
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

function keptFilesFailed(
  failure: "domain" | "schema",
  causeCode: string,
  headline: string,
  problemPerListOrFile: readonly string[],
  repairAction: string,
): CommandResult {
  return {
    ...unchanged(CHECK),
    causeCode,
    data: null,
    exitCode: failure === "schema" ? 4 : 3,
    failureClass: failure,
    handoff: {
      owner: "operator",
      reason: headline,
      inspect: [...problemPerListOrFile],
    },
    message: [headline, ...problemPerListOrFile].join("\n"),
    outcome: "failed",
    repairAction,
  };
}

function shortened(ids: readonly string[]): string {
  const more = ids.length - IDS_SHOWN_PER_LIST;
  const shown = ids.slice(0, IDS_SHOWN_PER_LIST).join(", ");
  return more > 0 ? `${shown}, and ${String(more)} more` : shown;
}

interface ForkChoice {
  readonly fork: string | undefined;
}

function forkCheckoutOption(args: readonly string[]): ForkChoice | undefined {
  if (args.length === 0) return { fork: undefined };
  return args.length === 2 && args[0] === "--fork"
    ? { fork: args[1] }
    : undefined;
}

function readListsFromFork(
  command: Command,
  forkCheckout: string,
  repository: string,
): CommandStep<ListWithItems[]> {
  return Effect.tryPromise({
    try: async () => {
      const sources = await readSourcesAsText(forkCheckout, repository);
      return listsKeptAsFiles.map((list) => ({
        list,
        items: list.extract(sources),
      }));
    },
    catch: (cause) =>
      refused(
        command,
        "domain",
        "DOMAIN_FORK_UNREADABLE",
        `The lists could not be read from the fork: ${why(cause)}`,
        `Pass the folder that holds the old system's source, keep ${DIAGRAM_COPY_PATH} in this repository, and retry.`,
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

async function filesWithNewText(
  repository: string,
  listed: readonly ListWithItems[],
) {
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

function partialWriteFailure(
  uncertainFiles: string[],
  cause: unknown,
): CommandResult {
  const reason = `The inventory files could not all be written: ${why(cause)}`;
  return {
    ...unchanged(EXTRACT),
    causeCode: "INTERNAL_INVENTORY_WRITE_UNKNOWN",
    data: null,
    effects: {
      completed: [],
      remaining: [],
      uncertain: uncertainFiles,
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
  forkCheckout: string,
  listed: readonly ListWithItems[],
  written: string[],
): CommandResult {
  const total = String(listed.length);
  const wrote = written.length > 0;
  const files = wrote
    ? `Wrote ${String(written.length)} of ${total} files under ${FOLDER}/.`
    : `Nothing under ${FOLDER}/ changed.`;
  return {
    ...unchanged(EXTRACT),
    ...(wrote ? WROTE_FILES : WROTE_NOTHING),
    data: {
      fork: forkCheckout,
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

// Interface: reads every list from the old system's source and keeps each as
// inventory/<list>.json in the folder the command runs in. Only a file whose
// text would differ is written, and nothing outside inventory/ is.
export function extractInventory(
  args: readonly string[],
): Promise<CommandResult> {
  const repository = process.cwd();
  const forkCheckout = forkCheckoutOption(args)?.fork;
  if (forkCheckout === undefined)
    return Promise.resolve(
      refused(
        EXTRACT,
        "usage",
        "USAGE_INVALID_INVOCATION",
        "inventory extract takes --fork PATH and nothing else.",
        "Pass --fork with the old system's folder and retry.",
      ),
    );
  return resultOf(
    Effect.gen(function* () {
      const listed = yield* readListsFromFork(
        EXTRACT,
        forkCheckout,
        repository,
      );
      const changed = yield* Effect.promise(() =>
        filesWithNewText(repository, listed),
      );
      const files = changed.map(({ file }) => file).sort();
      yield* Effect.tryPromise({
        try: () => write(repository, changed),
        catch: (cause) => partialWriteFailure(files, cause),
      });
      return extractedResult(forkCheckout, listed, files);
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

type KeptListOrProblem = { readonly list: List } & (
  | { readonly items: readonly Item[] }
  | { readonly problem: string }
);

async function decodedThroughSchema(
  list: List,
  document: unknown,
): Promise<KeptListOrProblem> {
  const refuseExcessKeys = {
    errors: "all",
    onExcessProperty: "error",
  } as const;
  const result = await Effect.runPromise(
    Effect.result(
      Schema.decodeUnknownEffect(list.fileSchema, refuseExcessKeys)(document),
    ),
  );
  if (Result.isSuccess(result)) return { list, items: result.success };
  const places = describe(result.failure.issue).issues.map(
    ({ path = [], message }) => `/${path.map(String).join("/")} ${message}`,
  );
  return { list, problem: shortened(places) };
}

async function kept(
  repository: string,
  list: List,
): Promise<KeptListOrProblem> {
  const text = await textOf(join(repository, fileOf(list)));
  if (text === undefined) return { list, problem: "missing" };
  const json = parsed(text);
  return json === undefined
    ? { list, problem: "not a JSON document" }
    : decodedThroughSchema(list, json.document);
}

async function strayJsonFiles(repository: string): Promise<string[]> {
  const known = new Set(listsKeptAsFiles.map((list) => `${list.name}.json`));
  const names = await readdir(join(repository, FOLDER)).catch(() => []);
  return names.filter((name) => name.endsWith(".json") && !known.has(name));
}

function allKeptLists(repository: string): CommandStep<ListWithItems[]> {
  return Effect.gen(function* () {
    const files = yield* Effect.promise(() =>
      Promise.all(listsKeptAsFiles.map((list) => kept(repository, list))),
    );
    const unknown = yield* Effect.promise(() => strayJsonFiles(repository));
    const problems = [
      ...files.flatMap((file) =>
        "problem" in file ? [`${fileOf(file.list)}: ${file.problem}`] : [],
      ),
      ...unknown.map((name) => `${FOLDER}/${name}: no list has this name`),
    ];
    if (problems.length > 0)
      return yield* Effect.fail(
        keptFilesFailed(
          "schema",
          "SCHEMA_INVENTORY_MISMATCH",
          `${String(problems.length)} inventory files did not pass.`,
          problems,
          "Run inventory extract --fork PATH to write the lists again, or correct the schema in src/inventory/lists.ts.",
        ),
      );
    return files.flatMap((file) =>
      "items" in file ? [{ list: file.list, items: file.items }] : [],
    );
  });
}

const textIgnoringKeyOrder = (item: Item) =>
  JSON.stringify(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)));

const byTextIgnoringKeyOrder = (items: readonly Item[]) =>
  new Map(items.map((item) => [item.id, textIgnoringKeyOrder(item)]));

function differencesFromFresh(
  kept: readonly Item[],
  fresh: readonly Item[],
): string[] {
  const was = byTextIgnoringKeyOrder(kept);
  const now = byTextIgnoringKeyOrder(fresh);
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

function requireKeptMatchFork(
  forkCheckout: string,
  repository: string,
  kept: readonly ListWithItems[],
): CommandStep<void> {
  return Effect.gen(function* () {
    const fresh = yield* readListsFromFork(CHECK, forkCheckout, repository);
    const stale = kept.flatMap(({ list, items }, at) => {
      const differences = differencesFromFresh(items, fresh[at]?.items ?? []);
      return differences.length > 0
        ? [`${list.name}: ${differences.join("; ")}`]
        : [];
    });
    if (stale.length > 0)
      return yield* Effect.fail(
        keptFilesFailed(
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
  kept: readonly ListWithItems[],
  forkCheckout: string | undefined,
): CommandResult {
  const total = String(kept.length);
  const stateFiles = stateFileItemsFromRegistry().length;
  const registeredStateFiles = {
    items: stateFiles,
    from: "src/state-files/registry.ts",
  };
  const matches = forkCheckout === undefined ? "" : " They match the fork.";
  return {
    ...unchanged(CHECK),
    causeCode: "SUCCESS_UNCHANGED",
    data: {
      fork: forkCheckout ?? null,
      lists: kept.map(({ list, items }) => ({
        list: list.name,
        items: items.length,
        file: fileOf(list),
      })),
      stateFiles: registeredStateFiles,
    },
    exitCode: 0,
    failureClass: null,
    message: `${total} of ${total} inventory lists ok (${counts(kept)}), beside ${String(stateFiles)} state files in the registry.${matches}`,
    nextAction: "No follow-up is required.",
    outcome: "success",
    repairAction: null,
  };
}

// Interface: proves the kept inventory in the folder the command runs in:
// every list has its file, and each file reads through its schema. With
// --fork, each list is also read from the fork again and compared, so a list
// that no longer matches the fork fails by name, with the ids that differ.
export function checkInventory(
  args: readonly string[],
): Promise<CommandResult> {
  const repository = process.cwd();
  const option = forkCheckoutOption(args);
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
  const { fork: forkCheckout } = option;
  return resultOf(
    Effect.gen(function* () {
      const kept = yield* allKeptLists(repository);
      if (forkCheckout !== undefined)
        yield* requireKeptMatchFork(forkCheckout, repository, kept);
      return checkedResult(kept, forkCheckout);
    }),
  );
}
