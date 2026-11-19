import { expect, test } from "bun:test";
import { Effect } from "effect";
import { findStateFile, stateFiles } from "../src/state-files/registry.ts";
import { roundTrip } from "../src/state-files/round-trip.ts";
import { fileText, validFiles } from "./state-file-fixtures.ts";

const TASKS = ".local/share/shepherdr/tasks";
const STATE = ".local/state/shepherdr";
const HERDR_CORE = ".local/state/herdr-core/default";

function verdictOf(path: string, content: unknown) {
  const file = findStateFile(path);
  if (file === undefined) throw new Error(`No registry entry for ${path}`);
  return Effect.runPromise(roundTrip(file, fileText(path, content)));
}

function changedValidFile(
  path: string,
  change: (file: Record<string, unknown>) => void,
) {
  const file = structuredClone(validFiles[path]) as Record<string, unknown>;
  change(file);
  return verdictOf(path, file);
}

for (const [path, content] of Object.entries(validFiles)) {
  test(`reads and writes back unchanged: ${path}`, async () => {
    expect(await verdictOf(path, content)).toEqual({ status: "ok" });
  });
}

test("every registry entry has a fixture that round-trips", () => {
  const covered = new Set(
    Object.keys(validFiles).map((path) => findStateFile(path)),
  );
  expect(stateFiles.filter((file) => !covered.has(file))).toEqual([]);
});

test("a named file in the tasks folder is not taken for a task list", () => {
  expect(findStateFile(`${TASKS}/.launches.json`)?.family).toBe("attempts");
  expect(findStateFile(`${TASKS}/.config-example.json`)?.family).toBe(
    "task-lists",
  );
});

test("a path outside the registry has no entry", () => {
  expect(findStateFile(`${TASKS}/.launches.lock`)).toBeUndefined();
  expect(findStateFile(`${TASKS}/nested/widgets.json`)).toBeUndefined();
  expect(findStateFile(`${STATE}/service/token`)).toBeUndefined();
});

const unknownKeyCases: [
  string,
  (file: Record<string, unknown>) => void,
  string,
][] = [
  [`${TASKS}/widgets.json`, (file) => (file.colour = "red"), "/colour"],
  [`${TASKS}/.launches.json`, (file) => (file.epoch = 3), "/epoch"],
  [`${TASKS}/.scheduler.json`, (file) => (file.host = "example"), "/host"],
  [
    ".config/shepherdr/settings.json",
    (file) => (file.theme = "dark"),
    "/theme",
  ],
  [`${STATE}/service/service.json`, (file) => (file.token = "x"), "/token"],
  [`${STATE}/cli-check.json`, (file) => (file.note = "x"), "/note"],
];

for (const [path, change, pointer] of unknownKeyCases) {
  test(`an unknown key would be lost on write: ${path}`, async () => {
    expect(await changedValidFile(path, change)).toEqual({
      status: "round-trip-differs",
      pointers: [pointer],
    });
  });
}

const wrongTypes: [
  string,
  (file: Record<string, unknown>) => void,
  { at: string; problem: string },
][] = [
  [
    `${TASKS}/widgets.json`,
    (file) => (file.next = "3"),
    { at: "/next", problem: "Expected number" },
  ],
  [
    `${TASKS}/.publications.json`,
    (file) => (file.version = 2),
    { at: "/version", problem: "Expected 1" },
  ],
  [
    `${TASKS}/.reactions.json`,
    (file) => (file.at = 1.5),
    { at: "/at", problem: "Expected an integer" },
  ],
  [
    ".config/shepherdr/model-picks.json",
    (file) => (file.pinned = "claude:example-model"),
    { at: "/pinned", problem: "Expected array" },
  ],
  [
    `${STATE}/service/web.json`,
    (file) => delete file.on,
    { at: "/on", problem: "Missing key" },
  ],
  [
    `${STATE}/codex-sandbox.json`,
    (file) => (file.broken = false),
    { at: "/broken", problem: "Expected object | null" },
  ],
  [
    `${HERDR_CORE}/terminals.json`,
    (file) => (file.terminals = []),
    { at: "/terminals", problem: "Expected object" },
  ],
];

for (const [path, change, finding] of wrongTypes) {
  test(`a wrong type does not decode: ${path}`, async () => {
    expect(await changedValidFile(path, change)).toEqual({
      status: "decode-failed",
      findings: [finding],
    });
  });
}

test("a task state outside the six stored states does not decode", async () => {
  const verdict = await verdictOf(`${TASKS}/widgets.json`, {
    version: 1,
    folder: "/example-home/widgets",
    kind: "repo",
    name: "widgets",
    slug: "widgets",
    next: 2,
    tasks: [
      {
        id: 1,
        title: "Example",
        prompt: "",
        mode: "here",
        state: "merging",
        created: 1,
        agents: [],
      },
    ],
  });
  expect(verdict).toEqual({
    status: "decode-failed",
    findings: [
      {
        at: "/tasks/0/state",
        problem:
          'Expected "todo" | "scheduled" | "queued" | "running" | "ready" | "done"',
      },
    ],
  });
});

test("a key of an open record is never printed", async () => {
  const launches = await verdictOf(`${TASKS}/.launches.json`, {
    version: 1,
    launches: {
      "0f8fad5b-d9cb-469f-a165-70867728950e": { state: "sent" },
      "not-a-launch-id": {},
    },
    claims: { "task:private-folder#7": 7 },
  });
  expect(JSON.stringify(launches)).not.toContain("0f8fad5b");
  expect(JSON.stringify(launches)).not.toContain("private-folder");
  expect(launches).toMatchObject({
    status: "decode-failed",
    findings: expect.arrayContaining([
      { at: "/launches/*/launch", problem: "Missing key" },
      { at: "/claims/*", problem: "Expected string" },
    ]) as unknown,
  });

  const dropped = await verdictOf(`${STATE}/service/sent.json`, {
    "private-send-id": { at: 1, result: { ok: true, at: 1, how: "typed" } },
  });
  expect(dropped).toEqual({
    status: "round-trip-differs",
    pointers: ["/*/result/how"],
  });
});

test("a value is never printed", async () => {
  const verdict = await verdictOf(`${TASKS}/.scheduler.json`, {
    pid: "private-value",
    hash: ["private-value"],
    at: 1,
    terminal: null,
  });
  expect(JSON.stringify(verdict)).not.toContain("private-value");
});

test("a log is checked line by line", async () => {
  const file = findStateFile(`${TASKS}/.stops.jsonl`);
  if (file === undefined) throw new Error("No registry entry for the stop log");
  const lines = [
    '{"at":1,"kind":"memory-guard","memory":90,"terminals":[]}',
    '{"at":2,"kind":"memory-guard","memory":"high","terminals":[]}',
    "",
    '{"at":3,"kind":"memory-guard","memory":90,"terminals":[],"extra":1}',
    "{broken",
  ];
  expect(
    await Effect.runPromise(roundTrip(file, `${lines.join("\n")}\n`)),
  ).toEqual({
    status: "decode-failed",
    findings: [
      { at: "line 2 /memory", problem: "Expected number" },
      { at: "line 3", problem: "Expected a JSON document" },
      { at: "line 5", problem: "Expected a JSON document" },
    ],
  });
  expect(
    await Effect.runPromise(
      roundTrip(file, `${lines[0] ?? ""}\n${lines[3] ?? ""}\n`),
    ),
  ).toEqual({ status: "round-trip-differs", pointers: ["line 2 /extra"] });
});

test("an empty object in a task list must stay empty", async () => {
  const verdict = await changedValidFile(
    `${TASKS}/widgets.json`,
    (file) => (file.config = { max: 3 }),
  );
  expect(verdict).toEqual({
    status: "decode-failed",
    findings: [{ at: "/config", problem: "Expected an object with no keys" }],
  });
});

test("a third-party file is only read: what the schema leaves out is not a failure", async () => {
  const docs = `${HERDR_CORE}/docs.json`;
  expect(
    await changedValidFile(
      docs,
      (file) => (file["a.new.document"] = { value: [1] }),
    ),
  ).toEqual({ status: "ok" });
  expect(
    await changedValidFile(
      docs,
      (file) => (file["shepherdr.node"] = { value: {} }),
    ),
  ).toEqual({
    status: "decode-failed",
    findings: [{ at: "/shepherdr.node/value/serving", problem: "Missing key" }],
  });
});

test("a file that is not JSON does not decode, and its text is not repeated, though JSON.parse's own message quotes it", async () => {
  const file = findStateFile(".local/share/shepherdr/LAYOUT");
  if (file === undefined) throw new Error("No registry entry for LAYOUT");
  expect(await Effect.runPromise(roundTrip(file, "private words\n"))).toEqual({
    status: "decode-failed",
    findings: [{ at: "", problem: "Expected a JSON document" }],
  });
  expect(await Effect.runPromise(roundTrip(file, "-1\n"))).toEqual({
    status: "decode-failed",
    findings: [
      { at: "", problem: "Expected a value greater than or equal to 0" },
    ],
  });
});
