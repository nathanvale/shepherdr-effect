import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sources } from "./lists.ts";
import type { SourceFile } from "./source.ts";

/** Where this repository keeps its copy of the old system's diagram, from the repository root. */
export const DIAGRAM = "docs/design/current-architecture.mmd";

/** A folder's own source files with one ending, tests left out, in name order. Folders inside it are not entered. */
async function sourcesIn(
  forkCheckout: string,
  folder: string,
  suffix: string,
): Promise<SourceFile[]> {
  const entries = await readdir(join(forkCheckout, folder), {
    withFileTypes: true,
  });
  const names = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(suffix) && !name.includes(".test."))
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      path: `${folder}/${name}`,
      text: await readFile(join(forkCheckout, folder, name), "utf8"),
    })),
  );
}

/**
 * Reads the old system's source as text, and the diagram from this
 * repository. Nothing in the fork is run or written.
 */
export async function readSources(
  forkCheckout: string,
  repository: string,
): Promise<Sources> {
  const [python, service, client, coreFolder, diagram] = await Promise.all([
    sourcesIn(forkCheckout, "mods/tasks/bin/herdr_task", ".py"),
    sourcesIn(forkCheckout, "service", ".ts"),
    // The link to herdr-core is the one part of the service kept in a folder of its own.
    sourcesIn(forkCheckout, "service/hc", ".ts"),
    sourcesIn(forkCheckout, "core", ".js"),
    readFile(join(repository, DIAGRAM), "utf8"),
  ]);
  return {
    python,
    service: [...service, ...client],
    coreFolder,
    diagram: { path: DIAGRAM, text: diagram },
  };
}
