import { stateFiles } from "../../state-files/registry.ts";
import { byId, type Item } from "./source.ts";

const REGISTRY = "src/state-files/registry.ts";

/**
 * The state files as inventory items, taken from the registry each time: the
 * registry stays their one list, and no file of them is kept. An entry that
 * matches by pattern is named by its pattern.
 */
export function stateFileItems(): Item[] {
  return byId(
    stateFiles.map(({ file }) => ({
      id: typeof file === "string" ? file : file.source,
      kind: "state-file",
      source: REGISTRY,
    })),
  );
}
