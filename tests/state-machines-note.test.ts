import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attemptTransitions } from "../src/domains/attempt/index.ts";
import { taskTransitions } from "../src/domains/task/index.ts";

const note = readFileSync(
  join(import.meta.dir, "../docs/design/state-machines.md"),
  "utf8",
);

const diagrams = [...note.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(
  ([, diagram = ""]) => diagram,
);

function drawnEdges(diagram: string): string[] {
  return diagram
    .split("\n")
    .flatMap((line) => {
      const edge = /^\s*(\w+) --> (\w+): (.+)$/.exec(line);
      if (edge === null) return [];
      const [, from = "", to = "", events = ""] = edge;
      return events.split(", ").map((event) => `${from} --${event}--> ${to}`);
    })
    .sort();
}

function rowsOfTables(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
        .join(" | "),
    );
}

const attemptEdges = Object.entries(attemptTransitions).flatMap(
  ([state, events]) =>
    Object.entries(events).flatMap(([event, cell]) =>
      cell.to === undefined ? [] : [`${state} --${event}--> ${cell.to}`],
    ),
);

const taskEdges = Object.entries(taskTransitions).flatMap(([event, row]) =>
  Object.entries(row.from).flatMap(([state, cell]) =>
    [cell.to, cell.ifStarted].flatMap((to) =>
      to === undefined ? [] : [`${state} --${event}--> ${to}`],
    ),
  ),
);

const attemptRows = Object.entries(attemptTransitions).map(([state, events]) =>
  [
    state,
    ...Object.values(events).map(
      (cell) => cell.to ?? `refused: ${cell.refusal}`,
    ),
  ].join(" | "),
);

const taskRows = Object.entries(taskTransitions).map(([event, row]) =>
  [
    event,
    row.by.join(", "),
    ...Object.values(row.from).map((cell) => {
      if (cell.to === undefined) return `refused: ${cell.refusal}`;
      return cell.ifStarted === undefined
        ? cell.to
        : `${cell.to}, or ${cell.ifStarted} if it started`;
    }),
  ].join(" | "),
);

test("the note draws one diagram for each state machine", () => {
  expect(diagrams).toHaveLength(2);
  expect(attemptEdges).toHaveLength(4);
  expect(taskEdges).toHaveLength(39);
});

test("the attempt diagram draws exactly the attempt table's transitions", () => {
  expect(drawnEdges(diagrams[0] ?? "")).toEqual([...attemptEdges].sort());
});

test("the task diagram draws exactly the task table's transitions", () => {
  expect(drawnEdges(diagrams[1] ?? "")).toEqual([...taskEdges].sort());
});

test("the note's tables hold every row of both transition tables", () => {
  const written = rowsOfTables(note);
  expect(attemptRows).toHaveLength(5);
  expect(taskRows).toHaveLength(11);
  expect(
    [...attemptRows, ...taskRows].filter((row) => !written.includes(row)),
  ).toEqual([]);
});
