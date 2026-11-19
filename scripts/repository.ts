import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = "repository.json";
const fullSha = /^[0-9a-f]{40}$/;
const webAddress = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;

export type TestArea = {
  readonly name: string;
  readonly folder: string;
  readonly holds: "files" | "folder";
  readonly subfolders: boolean;
};

export type Repository = {
  readonly web: string;
  readonly checkCommitsSince: string;
  readonly testAreas: readonly TestArea[];
  readonly citableWebs: readonly string[];
};

const citableOrigins = "citableOrigins";
const recordedOrigin = "recordedOrigin";

function fail(where: string, problem: string): never {
  throw new Error(`${file}: ${where} ${problem}`);
}

function fields(
  value: unknown,
  where: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Map<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(
      where,
      `must be an object. Repair: write it as an object with the keys ${required.join(", ")}.`,
    );
  const entries = new Map(Object.entries(value));
  const known = [...required, ...optional];
  for (const key of entries.keys())
    if (!known.includes(key))
      fail(where, `has key "${key}". Repair: use only ${known.join(", ")}.`);
  for (const key of required)
    if (!entries.has(key))
      fail(where, `needs key "${key}". Repair: add that key.`);
  return entries;
}

function requireText(value: unknown, where: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value === "")
    fail(where, "must be a non-empty string. Repair: write it as one.");
  if (pattern !== undefined && !pattern.test(value))
    fail(
      where,
      `is "${value}", which does not match ${pattern}. Repair: write a value that pattern matches.`,
    );
  return value;
}

function requireList(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value))
    fail(where, "must be an array. Repair: write it as a JSON array.");
  return value;
}

function plainFolder(folder: string, where: string): string {
  const parts = folder.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".."))
    fail(
      where,
      `is "${folder}", which is not a plain path from the repository root. Repair: write it with no ./ prefix, no trailing slash, and no . or .. part, such as "tests/template".`,
    );
  return folder;
}

function testArea(value: unknown, where: string): TestArea {
  const area = fields(
    value,
    where,
    ["name", "folder", "holds"],
    ["subfolders"],
  );
  const holds = area.get("holds");
  if (holds !== "files" && holds !== "folder")
    fail(
      `${where}.holds`,
      'must be "files" or "folder". Repair: set it to one of the two.',
    );
  const subfolders = area.get("subfolders") ?? false;
  if (typeof subfolders !== "boolean")
    fail(
      `${where}.subfolders`,
      "must be true or false. Repair: set it to one of the two.",
    );
  return {
    name: requireText(area.get("name"), `${where}.name`),
    folder: plainFolder(
      requireText(area.get("folder"), `${where}.folder`),
      `${where}.folder`,
    ),
    holds,
    subfolders,
  };
}

function checkRecordedOrigin(value: unknown): void {
  if (value === undefined) return;
  const origin = fields(value, recordedOrigin, ["web", "commit"]);
  requireText(origin.get("web"), `${recordedOrigin}.web`, webAddress);
  requireText(origin.get("commit"), `${recordedOrigin}.commit`, fullSha);
}

export function holdsTestFile(
  { folder, holds, subfolders }: TestArea,
  path: string,
): boolean {
  if (!path.startsWith(`${folder}/`)) return false;
  const direct = !path.slice(folder.length + 1).includes("/");
  return direct
    ? holds === "files" || !subfolders
    : holds === "folder" || subfolders;
}

export function testFilePlaces(areas: readonly TestArea[]): string[] {
  return areas.flatMap(({ folder, holds, subfolders }) => [
    ...(holds === "files" || !subfolders ? [`${folder}/`] : []),
    ...(subfolders ? [`${folder}/<area>/`] : []),
  ]);
}

export function readRepository(root: string): Repository {
  const path = join(root, file);
  if (!existsSync(path))
    throw new Error(
      `${file} is missing at ${root}. Each repository that runs these gates describes itself there. Repair: start from the template's ${file}, and set its web address and test areas.`,
    );
  const description = fields(
    JSON.parse(readFileSync(path, "utf8")),
    "the file",
    ["web", "checkCommitsSince", "testAreas"],
    [citableOrigins, recordedOrigin],
  );
  checkRecordedOrigin(description.get(recordedOrigin));
  const web = requireText(description.get("web"), "web", webAddress);
  return {
    web,
    checkCommitsSince: requireText(
      description.get("checkCommitsSince"),
      "checkCommitsSince",
      fullSha,
    ),
    testAreas: requireList(description.get("testAreas"), "testAreas").map(
      (area, index) => testArea(area, `testAreas[${index}]`),
    ),
    citableWebs: [
      web,
      ...requireList(description.get(citableOrigins) ?? [], citableOrigins).map(
        (origin, index) =>
          requireText(origin, `${citableOrigins}[${index}]`, webAddress),
      ),
    ],
  };
}
