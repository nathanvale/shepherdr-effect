import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sources } from "./lists.ts";
import type { SourceFile } from "./source.ts";

export const DIAGRAM_COPY_PATH = "docs/design/current-architecture.mmd";

async function ownNonTestSourcesIn(
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

export async function readSourcesAsText(
  forkCheckout: string,
  repository: string,
): Promise<Sources> {
  const [python, service, herdrCoreLink, coreFolder, diagram] =
    await Promise.all([
      ownNonTestSourcesIn(forkCheckout, "mods/tasks/bin/herdr_task", ".py"),
      ownNonTestSourcesIn(forkCheckout, "service", ".ts"),
      ownNonTestSourcesIn(forkCheckout, "service/hc", ".ts"),
      ownNonTestSourcesIn(forkCheckout, "core", ".js"),
      readFile(join(repository, DIAGRAM_COPY_PATH), "utf8"),
    ]);
  return {
    python,
    service: [...service, ...herdrCoreLink],
    coreFolder,
    diagram: { path: DIAGRAM_COPY_PATH, text: diagram },
  };
}
