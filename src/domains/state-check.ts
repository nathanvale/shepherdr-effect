import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { Effect } from "effect";
import type { OperationResult } from "../commands-contract.ts";
import { type Family, findStateFile } from "../state-files/registry.ts";
import { roundTrip, type Verdict } from "../state-files/round-trip.ts";

const IDENTITY = "example.state.check";
// A file can break its schema in every record it holds: a few places say enough.
const SHOWN = 8;

type FileVerdict = Verdict | { readonly status: "no-schema" };

interface CheckedFile {
  readonly path: string;
  readonly family: Family | null;
  readonly verdict: FileVerdict;
}

function unchanged() {
  return {
    commandIdentity: IDENTITY,
    effectClass: "inspect",
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
  failure: "usage" | "domain",
  causeCode: string,
  message: string,
  repairAction: string,
): OperationResult {
  return {
    ...unchanged(),
    causeCode,
    data: null,
    exitCode: failure === "usage" ? 2 : 3,
    failureClass: failure,
    message,
    nextAction: "Run state check --dir PATH with a state root folder.",
    outcome: "refused",
    repairAction,
  };
}

function rootArgument(args: readonly string[]): string | undefined {
  const [option, root, ...rest] = args;
  return option === "--dir" && root !== undefined && rest.length === 0
    ? root
    : undefined;
}

/** Every regular file under the root, as a path from it with `/` between its parts. */
const listFiles = (root: string) =>
  Effect.tryPromise(async () => {
    const entries = await readdir(root, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .map((path) => path.split(sep).join("/"))
      .sort();
  });

const unreadable: Verdict = {
  status: "decode-failed",
  findings: [{ at: "", problem: "Expected a readable UTF-8 file" }],
};

/** A file with no schema is never opened: only its name is known here. */
function checkFile(root: string, path: string): Effect.Effect<CheckedFile> {
  const file = findStateFile(path);
  if (file === undefined)
    return Effect.succeed({
      path,
      family: null,
      verdict: { status: "no-schema" },
    });
  return Effect.tryPromise(() => readFile(join(root, path), "utf8")).pipe(
    Effect.flatMap((text) => roundTrip(file, text)),
    Effect.orElseSucceed(() => unreadable),
    Effect.map((verdict) => ({ path, family: file.family, verdict })),
  );
}

function shortened(items: readonly string[]): string {
  const more = items.length - SHOWN;
  const shown = items.slice(0, SHOWN).join("; ");
  return more > 0 ? `${shown}; and ${String(more)} more` : shown;
}

const place = (at: string) => at || "(root)";

function reason(verdict: FileVerdict): string {
  if (verdict.status === "decode-failed") {
    const places = verdict.findings.map(
      (finding) => `${place(finding.at)} ${finding.problem}`,
    );
    return `decode failed: ${shortened(places)}`;
  }
  if (verdict.status === "round-trip-differs")
    return `round trip differs: ${shortened(verdict.pointers.map(place))}`;
  return verdict.status === "ok" ? "ok" : "no schema";
}

function familyCounts(files: readonly CheckedFile[]) {
  const counts = new Map<Family, number>();
  for (const { family } of files)
    if (family !== null) counts.set(family, (counts.get(family) ?? 0) + 1);
  return [...counts].map(([family, checked]) => ({ family, files: checked }));
}

function report(root: string, files: readonly CheckedFile[]): OperationResult {
  if (files.length === 0)
    return refused(
      "domain",
      "DOMAIN_STATE_ROOT_EMPTY",
      "The state root holds no files.",
      "Pass the folder that holds the state files and retry.",
    );
  const bad = files.filter(({ verdict }) => verdict.status !== "ok");
  const total = String(files.length);
  if (bad.length === 0) {
    const families = familyCounts(files);
    const summary = families
      .map(({ family, files: checked }) => `${family} ${String(checked)}`)
      .join(", ");
    return {
      ...unchanged(),
      causeCode: "SUCCESS_UNCHANGED",
      data: {
        root,
        families,
        files: files.map(({ path, family }) => ({ path, family })),
      },
      exitCode: 0,
      failureClass: null,
      message: `${total} of ${total} state files ok (${summary}).`,
      nextAction: "No follow-up is required.",
      outcome: "success",
      repairAction: null,
    };
  }
  const lines = bad.map(({ path, verdict }) => `${path}: ${reason(verdict)}`);
  const headline = `${String(bad.length)} of ${total} state files did not pass.`;
  return {
    ...unchanged(),
    causeCode: "SCHEMA_STATE_FILE_MISMATCH",
    data: null,
    exitCode: 4,
    failureClass: "schema",
    handoff: { owner: "operator", reason: headline, inspect: lines },
    message: [headline, ...lines].join("\n"),
    outcome: "failed",
    repairAction:
      "Correct the schema under src/state-files, or the file, then run state check again.",
  };
}

/**
 * Proves the state file schemas against a folder of real files: each file is
 * decoded with its registry entry, encoded back and compared with what was
 * read. Nothing is written, and no file content leaves this function.
 */
export function checkStateFiles(
  args: readonly string[],
): Promise<OperationResult> {
  const root = rootArgument(args);
  if (root === undefined)
    return Promise.resolve(
      refused(
        "usage",
        "USAGE_INVALID_INVOCATION",
        "state check takes --dir PATH and nothing else.",
        "Pass --dir with one folder path and retry.",
      ),
    );
  const checked = listFiles(root).pipe(
    Effect.flatMap((paths) =>
      Effect.forEach(paths, (path) => checkFile(root, path), {
        concurrency: 8,
      }),
    ),
    Effect.map((files) => report(root, files)),
    Effect.orElseSucceed(() =>
      refused(
        "domain",
        "DOMAIN_STATE_ROOT_UNREADABLE",
        "The state root is not a folder that can be read.",
        "Pass an existing folder that holds the state files and retry.",
      ),
    ),
  );
  return Effect.runPromise(checked);
}
