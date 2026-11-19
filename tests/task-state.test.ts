import { expect, test } from "bun:test";
import { Result, Schema } from "effect";
import {
  type Caller,
  type TaskEvent,
  type TaskRefusal,
  TaskState,
  taskTransitions,
  transitionTask,
} from "../src/domains/task/index.ts";
import { attemptId, terminalFor } from "./attempt-fixtures.ts";

const STATES = [
  "todo",
  "scheduled",
  "queued",
  "running",
  "ready",
  "done",
] as const;
const CALLERS: readonly Caller[] = [
  "person",
  "assistant",
  "worker",
  "reviewer",
  "scheduler",
];

type State = (typeof STATES)[number];
type Outcomes = readonly [string, string, string, string, string, string];

const notScheduled = "refused: NotScheduled";
const notReady = "refused: NotReady";
const notRunning = "refused: NotRunning";
const alreadyStarted = "refused: AlreadyStarted";
const taskDone = "refused: TaskDone";

const EXPECTED = {
  Schedule: {
    by: ["person", "assistant"],
    from: [
      "scheduled",
      "scheduled",
      "scheduled",
      alreadyStarted,
      alreadyStarted,
      alreadyStarted,
    ],
  },
  Unschedule: {
    by: ["person", "assistant"],
    from: [
      notScheduled,
      "todo",
      notScheduled,
      notScheduled,
      notScheduled,
      notScheduled,
    ],
  },
  Queue: {
    by: ["person", "assistant", "scheduler"],
    from: ["queued", "queued", "queued", "queued", "queued", taskDone],
  },
  Due: {
    by: ["scheduler"],
    from: [
      notScheduled,
      "queued",
      notScheduled,
      notScheduled,
      notScheduled,
      notScheduled,
    ],
  },
  AssignAgent: {
    by: ["person", "assistant", "scheduler"],
    from: ["running", "running", "running", "running", "ready", "running"],
  },
  MarkReady: {
    by: ["person", "worker"],
    from: ["ready", "ready", "ready", "ready", "ready", taskDone],
  },
  BackToWork: {
    by: ["person", "assistant", "scheduler"],
    from: [notReady, notReady, notReady, notReady, "running", notReady],
  },
  ReadyAgain: {
    by: ["scheduler"],
    from: [notRunning, notRunning, notRunning, "ready", notRunning, notRunning],
  },
  MarkDone: {
    by: ["person", "assistant"],
    from: ["done", "done", "done", "done", "done", "done"],
  },
  Reopen: {
    by: ["person", "assistant"],
    from: ["todo", "todo", "todo", "running", "running", "running"],
  },
} satisfies Record<
  TaskEvent["_tag"],
  { by: readonly Caller[]; from: Outcomes }
>;

type Event = keyof typeof EXPECTED;
const EVENTS = Object.keys(EXPECTED).filter(
  (name): name is Event => name in EXPECTED,
);

const SCHEDULED_FOR = 5_000;

const taskIn: Record<State, TaskState> = {
  todo: { state: "todo", started: false },
  scheduled: {
    state: "scheduled",
    started: false,
    scheduledFor: SCHEDULED_FOR,
  },
  queued: { state: "queued", started: false },
  running: { state: "running", started: true },
  ready: { state: "ready", started: true },
  done: { state: "done", started: true, markedBy: "person" },
};

function eventBy(event: Event, by: Caller): TaskEvent {
  if (event === "Schedule")
    return { _tag: event, by, scheduledFor: SCHEDULED_FOR };
  if (event === "Due") return { _tag: event, by, now: SCHEDULED_FOR };
  if (event === "AssignAgent")
    return {
      _tag: event,
      by,
      confirmed: {
        _tag: "Confirmed",
        id: attemptId,
        evidence: terminalFor(attemptId),
      },
    };
  return { _tag: event, by };
}

function outcomeOf(task: TaskState, event: TaskEvent): string {
  const result = transitionTask(task, event);
  return Result.isSuccess(result)
    ? result.success.state
    : `refused: ${result.failure._tag}`;
}

function stateAfter(task: TaskState, event: TaskEvent): TaskState {
  const result = transitionTask(task, event);
  if (Result.isFailure(result))
    throw new Error(
      `${task.state} refused ${event._tag}: ${result.failure._tag}`,
    );
  return result.success;
}

const triples = EVENTS.flatMap((event) =>
  STATES.flatMap((state, at) =>
    CALLERS.map((by) => {
      const allowed: readonly Caller[] = EXPECTED[event].by;
      const expected = allowed.includes(by)
        ? EXPECTED[event].from[at]
        : "refused: CallerMayNot";
      return [event, state, by, expected] as const;
    }),
  ),
);

test("the task table has ten events, each over the six stored states", () => {
  expect(Object.keys(taskTransitions)).toEqual(EVENTS);
  expect(EVENTS).toHaveLength(10);
  for (const event of EVENTS)
    expect(Object.keys(taskTransitions[event].from)).toEqual([...STATES]);
  expect(triples).toHaveLength(300);
});

test.each(triples)(
  "%s on a %s task by the %s gives %s",
  (event, state, by, expected) => {
    expect(outcomeOf(taskIn[state], eventBy(event, by))).toBe(expected ?? "");
  },
);

test.each(EVENTS)(
  "the table says who may cause %s, and where it leads",
  (event) => {
    const row = taskTransitions[event];
    expect([...row.by]).toEqual(EXPECTED[event].by);
    expect(
      STATES.map((state) => {
        const cell = row.from[state];
        const started = taskIn[state].started;
        return (
          (started ? (cell.ifStarted ?? cell.to) : cell.to) ??
          `refused: ${cell.refusal}`
        );
      }),
    ).toEqual([...EXPECTED[event].from]);
  },
);

test.each(["person", "assistant"] as const)(
  "a task marked Done by the %s records that",
  (by) => {
    expect(stateAfter(taskIn.ready, { _tag: "MarkDone", by })).toEqual({
      state: "done",
      started: true,
      markedBy: by,
    });
  },
);

test("a worker, a reviewer and the scheduler cannot mark a task Done", () => {
  const refused = (["worker", "reviewer", "scheduler"] as const).flatMap((by) =>
    STATES.map((state) => outcomeOf(taskIn[state], { _tag: "MarkDone", by })),
  );
  expect(refused).toHaveLength(18);
  expect(new Set(refused)).toEqual(new Set(["refused: CallerMayNot"]));
});

test("a refusal names its cause, the stored state, the event and the caller", () => {
  const refusal: TaskRefusal = {
    _tag: "CallerMayNot",
    state: "ready",
    event: "MarkDone",
    by: "worker",
  };
  const result = transitionTask(taskIn.ready, {
    _tag: "MarkDone",
    by: "worker",
  });
  expect(Result.isFailure(result) ? result.failure : "no refusal").toEqual(
    refusal,
  );
});

test("marking a Done task Done again keeps who first marked it", () => {
  expect(
    stateAfter(taskIn.done, { _tag: "MarkDone", by: "assistant" }),
  ).toEqual(taskIn.done);
});

const reopened: readonly (readonly [string, TaskState, TaskState])[] = [
  [
    "a Done task that never started",
    { state: "done", started: false, markedBy: "person" },
    { state: "todo", started: false },
  ],
  [
    "a Done task that started",
    { state: "done", started: true, markedBy: "person" },
    { state: "running", started: true },
  ],
  [
    "a To do task that started before",
    { state: "todo", started: true },
    { state: "running", started: true },
  ],
  [
    "a To do task that never started",
    { state: "todo", started: false },
    { state: "todo", started: false },
  ],
];

test.each(reopened)("reopening %s", (_what, task, expected) => {
  expect(stateAfter(task, { _tag: "Reopen", by: "person" })).toEqual(expected);
});

test("a scheduled task is not due before its time", () => {
  const due = (now: number) =>
    outcomeOf(taskIn.scheduled, { _tag: "Due", by: "scheduler", now });
  expect([
    due(SCHEDULED_FOR - 1),
    due(SCHEDULED_FOR),
    due(SCHEDULED_FOR + 1),
  ]).toEqual(["refused: NotYetDue", "queued", "queued"]);
});

test("scheduling again replaces the time", () => {
  expect(
    stateAfter(taskIn.scheduled, {
      _tag: "Schedule",
      by: "person",
      scheduledFor: 9_000,
    }),
  ).toEqual({ state: "scheduled", started: false, scheduledFor: 9_000 });
});

test("a task remembers that it started, through Done and back", () => {
  const running = stateAfter(taskIn.todo, eventBy("AssignAgent", "scheduler"));
  const done = stateAfter(running, { _tag: "MarkDone", by: "person" });
  const queued = stateAfter(running, { _tag: "Queue", by: "person" });
  expect([running, done, queued]).toEqual([
    { state: "running", started: true },
    { state: "done", started: true, markedBy: "person" },
    { state: "queued", started: true },
  ]);
});

const decodes = (value: unknown) =>
  Result.isSuccess(Schema.decodeUnknownResult(TaskState)(value));

test("every stored state decodes", () => {
  expect(STATES.filter((state) => !decodes(taskIn[state]))).toEqual([]);
});

test.each([
  ["a Done task without who marked it", { state: "done", started: true }],
  [
    "a task marked Done by a worker",
    { state: "done", started: true, markedBy: "worker" },
  ],
  ["a scheduled task without its time", { state: "scheduled", started: false }],
  ["a running task that never started", { state: "running", started: false }],
  ["a seventh stored state", { state: "merging", started: true }],
])("%s does not decode", (_what, value) => {
  expect(decodes(value)).toBe(false);
});
