import { Schema } from "effect";
import {
  byId,
  fileAt,
  itemFields,
  lineAt,
  matchesIn,
  place,
  type SourceFile,
} from "./source.ts";

export const CoreRpcMethod = Schema.Struct({
  ...itemFields("core-rpc-method"),
  /** In the list the client refuses to start without. */
  required: Schema.Boolean,
  /** Passed by name to a `call(...)` somewhere in the service. */
  called: Schema.Boolean,
});
export type CoreRpcMethod = (typeof CoreRpcMethod)["Type"];

const CLIENT = "service/hc/client.ts";
const REQUIRED = /\bREQUIRED\s*=\s*\[([^\]]*)\]/;
const QUOTED = /(["'])([^"'\\\n]+)\1/g;
// `hub.call<{ code: number }>("machine.exec", ...)`: a type argument may stand between the name and the bracket.
const CALL = /\bcall\s*(?:<[^()]*?>)?\(\s*(["'])([A-Za-z][\w.]*)\1/g;

function requiredMethods(client: SourceFile): Map<string, number> {
  const list = REQUIRED.exec(client.text);
  if (list === null)
    throw new Error(`${client.path} has no REQUIRED list of method names.`);
  const start = list.index + list[0].indexOf("[");
  return new Map(
    [...(list[1] ?? "").matchAll(QUOTED)].map((word) => [
      word[2] ?? "",
      lineAt(client.text, start + 1 + word.index),
    ]),
  );
}

/**
 * The herdr-core methods the service's client requires, and every method the
 * service calls by name. A method can be required and never called: the
 * client checks that the core has it and nothing uses it.
 */
export function coreRpcMethods(files: readonly SourceFile[]): CoreRpcMethod[] {
  const client = fileAt(files, CLIENT);
  const required = requiredMethods(client);
  const called = new Map<string, string>();
  for (const file of files)
    for (const { match, line } of matchesIn(file, CALL)) {
      const method = match[2] ?? "";
      if (!called.has(method)) called.set(method, place(file.path, line));
    }
  const ids = new Set([...required.keys(), ...called.keys()]);
  return byId(
    [...ids].map((id) => {
      const listed = required.get(id);
      return {
        id,
        kind: "core-rpc-method" as const,
        // A required method is cited where the list names it, any other at its first call.
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
