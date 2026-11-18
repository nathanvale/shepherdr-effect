import {
  Effect,
  JsonPointer,
  Result,
  Schema,
  SchemaAST,
  SchemaIssue,
} from "effect";
import type { StateFile } from "./registry.ts";

/** Where a document broke its schema, and what the schema wanted there. Never the value. */
export interface Finding {
  readonly at: string;
  readonly problem: string;
}

export type Verdict =
  | { readonly status: "ok" }
  | { readonly status: "decode-failed"; readonly findings: readonly Finding[] }
  | {
      readonly status: "round-trip-differs";
      readonly pointers: readonly string[];
    };

type Path = readonly PropertyKey[];

const OK: Verdict = { status: "ok" };
const describe = SchemaIssue.makeFormatterStandardSchemaV1();

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A union stands for its members, and a schema that refers to itself for its target. */
function alternatives(node: SchemaAST.AST): readonly SchemaAST.AST[] {
  if (SchemaAST.isSuspend(node)) return alternatives(node.thunk());
  if (SchemaAST.isUnion(node)) return node.types.flatMap(alternatives);
  return [node];
}

/**
 * A JSON pointer that is safe to print. A key the schema declares is
 * structure and is shown. A key that an open record admits is data (a task
 * number, a machine name), so it is printed as `*`.
 */
function pointer(schema: SchemaAST.AST, path: Path): string {
  const tokens: string[] = [];
  let nodes: readonly SchemaAST.AST[] = [schema];
  for (const segment of path) {
    const key = String(segment);
    const here = nodes.flatMap(alternatives);
    const objects = here.filter(SchemaAST.isObjects);
    const arrays = here.filter(SchemaAST.isArrays);
    const declared = objects.flatMap((object) =>
      object.propertySignatures
        .filter((property) => property.name === key)
        .map((property) => property.type),
    );
    const admitted = objects.flatMap((object) =>
      object.indexSignatures.map((index) => index.type),
    );
    if (declared.length > 0) {
      nodes = declared;
      tokens.push(key);
    } else if (arrays.length > 0) {
      nodes = arrays.flatMap((array) => [...array.elements, ...array.rest]);
      tokens.push(key);
    } else {
      nodes = admitted;
      // Undeclared in a closed object: a key name the schema does not know yet.
      tokens.push(objects.length > 0 && admitted.length === 0 ? key : "*");
    }
  }
  return tokens.map((token) => `/${JsonPointer.escapeToken(token)}`).join("");
}

function findingsOf(
  schema: SchemaAST.AST,
  issue: SchemaIssue.Issue,
): Finding[] {
  const found = new Map<string, Finding>();
  const visit = (node: SchemaIssue.Issue, path: Path): void => {
    if (node._tag === "Pointer") {
      visit(node.issue, [...path, ...node.path]);
    } else if (node._tag === "Encoding") {
      visit(node.issue, path);
    } else if (
      node._tag === "Composite" ||
      (node._tag === "AnyOf" && node.issues.length > 0)
    ) {
      for (const inner of node.issues) visit(inner, path);
    } else {
      const at = pointer(schema, path);
      const problem = describe(node)
        .issues.map((leaf) => leaf.message)
        .join("; ");
      // Every entry of an open record can fail the same way: say it once.
      found.set(`${at} ${problem}`, { at, problem });
    }
  };
  visit(issue, []);
  return [...found.values()];
}

function differences(original: unknown, written: unknown, path: Path): Path[] {
  if (Array.isArray(original) && Array.isArray(written)) {
    const length = Math.max(original.length, written.length);
    return Array.from({ length }, (_, index): Path[] => {
      const at = [...path, index];
      if (index >= original.length || index >= written.length) return [at];
      const before: unknown = original[index];
      const after: unknown = written[index];
      return differences(before, after, at);
    }).flat();
  }
  if (isObject(original) && isObject(written)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(written)]);
    return [...keys].flatMap((key) => {
      const at = [...path, key];
      if (!Object.hasOwn(original, key) || !Object.hasOwn(written, key))
        return [at];
      return differences(original[key], written[key], at);
    });
  }
  return original === written ? [] : [path];
}

function differs(pointers: readonly string[]): Verdict {
  return { status: "round-trip-differs", pointers: [...new Set(pointers)] };
}

/**
 * Decodes one parsed document, encodes it back and compares the two. A file
 * nobody here writes is only decoded: its schema models part of it, so it
 * could never come back whole.
 */
function verifyDocument(
  file: StateFile,
  original: unknown,
): Effect.Effect<Verdict> {
  const { ast } = file.schema;
  return Effect.gen(function* () {
    const decoded = yield* Effect.result(
      Schema.decodeUnknownEffect(file.schema, { errors: "all" })(original),
    );
    if (Result.isFailure(decoded)) {
      const findings = findingsOf(ast, decoded.failure.issue);
      return { status: "decode-failed", findings };
    }
    if (file.discipline.write === "never") return OK;
    const written = yield* Effect.result(
      Schema.encodeEffect(file.schema)(decoded.success),
    );
    if (Result.isFailure(written))
      return differs(
        findingsOf(ast, written.failure.issue).map(({ at }) => at),
      );
    const paths = differences(original, written.success, []);
    return paths.length === 0
      ? OK
      : differs(paths.map((path) => pointer(ast, path)));
  });
}

function parse(text: string): { readonly document: unknown } | undefined {
  try {
    const document: unknown = JSON.parse(text);
    return { document };
  } catch {
    // The parser's own message can quote the text, so it is not passed on.
    return undefined;
  }
}

/** One document's verdict, with each place prefixed by where the document sits in its file. */
function verifyText(
  file: StateFile,
  text: string,
  where: string,
): Effect.Effect<Verdict> {
  const place = (at: string) => [where, at].filter(Boolean).join(" ");
  const parsed = parse(text);
  if (parsed === undefined)
    return Effect.succeed({
      status: "decode-failed",
      findings: [{ at: place(""), problem: "Expected a JSON document" }],
    });
  return Effect.map(
    verifyDocument(file, parsed.document),
    (verdict): Verdict => {
      if (verdict.status === "decode-failed")
        return {
          ...verdict,
          findings: verdict.findings.map((finding) => ({
            ...finding,
            at: place(finding.at),
          })),
        };
      if (verdict.status === "round-trip-differs")
        return { ...verdict, pointers: verdict.pointers.map(place) };
      return verdict;
    },
  );
}

/** A log fails to decode if any line does. Otherwise it differs if any line does. */
function combine(verdicts: readonly Verdict[]): Verdict {
  const findings = verdicts.flatMap((verdict) =>
    verdict.status === "decode-failed" ? verdict.findings : [],
  );
  if (findings.length > 0) return { status: "decode-failed", findings };
  const pointers = verdicts.flatMap((verdict) =>
    verdict.status === "round-trip-differs" ? verdict.pointers : [],
  );
  return pointers.length > 0 ? differs(pointers) : OK;
}

/**
 * Checks a state file's text against its registry entry: it must decode, and
 * what would be written back must equal what was read.
 */
export function roundTrip(
  file: StateFile,
  text: string,
): Effect.Effect<Verdict> {
  if (file.format === "json") return verifyText(file, text, "");
  // A log ends with a new line. Any other empty line is not a document.
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return Effect.map(
    Effect.forEach(lines, (line, index) =>
      verifyText(file, line, `line ${String(index + 1)}`),
    ),
    combine,
  );
}
