import { stateFiles } from "../state-files/registry.ts";
import { byId, type Item } from "./source.ts";

const REGISTRY = "src/state-files/registry.ts";

export function stateFileItemsFromRegistry(): Item[] {
  return byId(
    stateFiles.map(({ file }) => ({
      id: typeof file === "string" ? file : file.source,
      kind: "state-file",
      source: REGISTRY,
    })),
  );
}
