import { Schema } from "effect";
import {
  byId,
  fileAtOrThrow,
  itemFields,
  oneBasedLineAt,
  matchesWithLines,
  place,
  type SourceFile,
} from "./source.ts";

export const HerdrCoreRpcMethod = Schema.Struct({
  ...itemFields("herdr-core-rpc-method"),
  required: Schema.Boolean.annotateKey({
    description: "In the list the client refuses to start without.",
  }),
  called: Schema.Boolean.annotateKey({
    description: "Passed by name to a call(...) somewhere in the service.",
  }),
});
export type HerdrCoreRpcMethod = (typeof HerdrCoreRpcMethod)["Type"];

const CLIENT = "service/hc/client.ts";
const REQUIRED = /\bREQUIRED\s*=\s*\[([^\]]*)\]/;
const QUOTED = /(["'])([^"'\\\n]+)\1/g;
const CALL = /\bcall\s*(?:<[^()]*?>)?\(\s*(["'])([A-Za-z][\w.]*)\1/g;

function requiredMethods(client: SourceFile): Map<string, number> {
  const list = REQUIRED.exec(client.text);
  if (list === null)
    throw new Error(`${client.path} has no REQUIRED list of method names.`);
  const start = list.index + list[0].indexOf("[");
  return new Map(
    [...(list[1] ?? "").matchAll(QUOTED)].map((word) => [
      word[2] ?? "",
      oneBasedLineAt(client.text, start + 1 + word.index),
    ]),
  );
}

export function herdrCoreRpcMethods(
  files: readonly SourceFile[],
): HerdrCoreRpcMethod[] {
  const client = fileAtOrThrow(files, CLIENT);
  const required = requiredMethods(client);
  const called = new Map<string, string>();
  for (const file of files)
    for (const { match, line } of matchesWithLines(file, CALL)) {
      const method = match[2] ?? "";
      if (!called.has(method)) called.set(method, place(file.path, line));
    }
  const ids = new Set([...required.keys(), ...called.keys()]);
  return byId(
    [...ids].map((id) => {
      const listed = required.get(id);
      return {
        id,
        kind: "herdr-core-rpc-method" as const,
        source:
          listed === undefined
            ? (called.get(id) ?? "")
            : place(client.path, listed),
        required: listed !== undefined,
        called: called.has(id),
      };
    }),
  );
}
