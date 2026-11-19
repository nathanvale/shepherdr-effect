import { Result, Schema } from "effect";
import type { Confirmed } from "../attempt/index.ts";

export const TaskState = Schema.Union([
  Schema.Struct({ state: Schema.Literal("todo"), started: Schema.Boolean }),
  Schema.Struct({
    state: Schema.Literal("scheduled"),
    started: Schema.Boolean,
    scheduledFor: Schema.Int,
  }),
  Schema.Struct({ state: Schema.Literal("queued"), started: Schema.Boolean }),
  Schema.Struct({
    state: Schema.Literal("running"),
    started: Schema.Literal(true),
  }),
  Schema.Struct({
    state: Schema.Literal("ready"),
    started: Schema.Literal(true),
  }),
  Schema.Struct({
    state: Schema.Literal("done"),
    started: Schema.Boolean,
    markedBy: Schema.Literals(["person", "assistant"]),
    reason: Schema.optionalKey(Schema.Never),
  }),
  Schema.Struct({
    state: Schema.Literal("done"),
    started: Schema.Boolean,
    markedBy: Schema.Literal("integration"),
    reason: Schema.Literals([
      "person-approval",
      "merge-policy",
      "merge-outside-shepherdr",
    ]),
  }),
]);
export type TaskState = typeof TaskState.Type;

export type Caller =
  | "person"
  | "assistant"
  | "worker"
  | "reviewer"
  | "scheduler";

export type TaskEvent =
  | {
      readonly _tag: "Schedule";
      readonly by: Caller;
      readonly scheduledFor: number;
    }
  | { readonly _tag: "Due"; readonly by: Caller; readonly now: number }
  | {
      readonly _tag: "AssignAgent";
      readonly by: Caller;
      readonly confirmed: Confirmed;
    }
  | {
      readonly _tag: "IntegrationConfirmed";
      readonly by: Caller;
      readonly reason: Extract<
        TaskState,
        { readonly markedBy: "integration" }
      >["reason"];
    }
  | {
      readonly _tag:
        | "Unschedule"
        | "Queue"
        | "MarkReady"
        | "BackToWork"
        | "ReadyAgain"
        | "MarkDone"
        | "Reopen";
      readonly by: Caller;
    };

export interface TaskRefusal {
  readonly _tag:
    | "CallerMayNot"
    | "AlreadyStarted"
    | "NotScheduled"
    | "NotYetDue"
    | "NotReady"
    | "NotRunning"
    | "TaskDone";
  readonly state: TaskState["state"];
  readonly event: TaskEvent["_tag"];
  readonly by: Caller;
}

type StateName = TaskState["state"];
type DoneMarker = Extract<TaskState, { readonly state: "done" }>["markedBy"];
type TableRefusal = Exclude<TaskRefusal["_tag"], "CallerMayNot" | "NotYetDue">;

interface Refused {
  readonly refusal: TableRefusal;
  readonly to?: never;
  readonly ifStarted?: never;
}
type Cell<To extends StateName> =
  | { readonly to: To; readonly ifStarted?: To; readonly refusal?: never }
  | Refused;

interface Row<By extends Caller, To extends StateName> {
  readonly by: readonly By[];
  readonly from: { readonly [State in StateName]: Cell<To> };
}

type WithoutItsOwnFacts = "todo" | "queued" | "running" | "ready";

const notScheduled = { refusal: "NotScheduled" } as const;
const notReady = { refusal: "NotReady" } as const;
const notRunning = { refusal: "NotRunning" } as const;
const alreadyStarted = { refusal: "AlreadyStarted" } as const;
const taskDone = { refusal: "TaskDone" } as const;

const transitions: {
  readonly Schedule: Row<Caller, "scheduled">;
  readonly MarkDone: Row<Extract<Caller, DoneMarker>, "done">;
  readonly IntegrationConfirmed: Row<Caller, "done">;
} & {
  readonly [Event in Exclude<
    TaskEvent["_tag"],
    "Schedule" | "MarkDone" | "IntegrationConfirmed"
  >]: Row<Caller, WithoutItsOwnFacts>;
} = {
  Schedule: {
    by: ["person", "assistant"],
    from: {
      todo: { to: "scheduled" },
      scheduled: { to: "scheduled" },
      queued: { to: "scheduled" },
      running: alreadyStarted,
      ready: alreadyStarted,
      done: alreadyStarted,
    },
  },
  Unschedule: {
    by: ["person", "assistant"],
    from: {
      todo: notScheduled,
      scheduled: { to: "todo" },
      queued: notScheduled,
      running: notScheduled,
      ready: notScheduled,
      done: notScheduled,
    },
  },
  Queue: {
    by: ["person", "assistant", "scheduler"],
    from: {
      todo: { to: "queued" },
      scheduled: { to: "queued" },
      queued: { to: "queued" },
      running: { to: "queued" },
      ready: { to: "queued" },
      done: taskDone,
    },
  },
  Due: {
    by: ["scheduler"],
    from: {
      todo: notScheduled,
      scheduled: { to: "queued" },
      queued: notScheduled,
      running: notScheduled,
      ready: notScheduled,
      done: notScheduled,
    },
  },
  AssignAgent: {
    by: ["person", "assistant", "scheduler"],
    from: {
      todo: { to: "running" },
      scheduled: { to: "running" },
      queued: { to: "running" },
      running: { to: "running" },
      ready: { to: "ready" },
      done: { to: "running" },
    },
  },
  MarkReady: {
    by: ["person", "worker"],
    from: {
      todo: { to: "ready" },
      scheduled: { to: "ready" },
      queued: { to: "ready" },
      running: { to: "ready" },
      ready: { to: "ready" },
      done: taskDone,
    },
  },
  BackToWork: {
    by: ["person", "assistant", "scheduler"],
    from: {
      todo: notReady,
      scheduled: notReady,
      queued: notReady,
      running: notReady,
      ready: { to: "running" },
      done: notReady,
    },
  },
  ReadyAgain: {
    by: ["scheduler"],
    from: {
      todo: notRunning,
      scheduled: notRunning,
      queued: notRunning,
      running: { to: "ready" },
      ready: notRunning,
      done: notRunning,
    },
  },
  MarkDone: {
    by: ["person", "assistant"],
    from: {
      todo: { to: "done" },
      scheduled: { to: "done" },
      queued: { to: "done" },
      running: { to: "done" },
      ready: { to: "done" },
      done: { to: "done" },
    },
  },
  IntegrationConfirmed: {
    by: ["person", "assistant", "scheduler"],
    from: {
      todo: notReady,
      scheduled: notReady,
      queued: notReady,
      running: notReady,
      ready: { to: "done" },
      done: { to: "done" },
    },
  },
  Reopen: {
    by: ["person", "assistant"],
    from: {
      todo: { to: "todo", ifStarted: "running" },
      scheduled: { to: "todo" },
      queued: { to: "todo" },
      running: { to: "running" },
      ready: { to: "running" },
      done: { to: "todo", ifStarted: "running" },
    },
  },
};

export const taskTransitions: Readonly<
  Record<
    TaskEvent["_tag"],
    {
      readonly by: readonly Caller[];
      readonly from: Readonly<
        Record<
          TaskState["state"],
          {
            readonly to?: TaskState["state"];
            readonly ifStarted?: TaskState["state"];
            readonly refusal?: TaskRefusal["_tag"];
          }
        >
      >;
    }
  >
> = transitions;

type Refusal = TaskRefusal["_tag"];

function allowedCell<By extends Caller, To extends StateName>(
  row: Row<By, To>,
  task: TaskState,
  caller: Caller,
): Result.Result<
  { readonly by: By; readonly to: To; readonly ifStarted: To | undefined },
  Refusal
> {
  const by = row.by.find((allowed) => allowed === caller);
  const cell = row.from[task.state];
  if (by === undefined) return Result.fail("CallerMayNot");
  if (cell.refusal !== undefined) return Result.fail(cell.refusal);
  return Result.succeed({ by, to: cell.to, ifStarted: cell.ifStarted });
}

function isBeforeItsTime(task: TaskState, event: TaskEvent): boolean {
  return (
    event._tag === "Due" &&
    task.state === "scheduled" &&
    event.now < task.scheduledFor
  );
}

function withoutItsOwnFacts(
  state: WithoutItsOwnFacts,
  started: boolean,
): TaskState {
  return state === "running" || state === "ready"
    ? { state, started: true }
    : { state, started };
}

function stateAfter(
  task: TaskState,
  event: TaskEvent,
): Result.Result<TaskState, Refusal> {
  const { started } = task;
  switch (event._tag) {
    case "Schedule":
      return Result.map(
        allowedCell(transitions.Schedule, task, event.by),
        ({ to }) => ({
          state: to,
          started,
          scheduledFor: event.scheduledFor,
        }),
      );
    case "MarkDone":
      return Result.map(
        allowedCell(transitions.MarkDone, task, event.by),
        ({ to, by }) =>
          task.state === "done" ? task : { state: to, started, markedBy: by },
      );
    case "IntegrationConfirmed":
      return Result.map(
        allowedCell(transitions.IntegrationConfirmed, task, event.by),
        ({ to }) =>
          task.state === "done"
            ? task
            : {
                state: to,
                started,
                markedBy: "integration",
                reason: event.reason,
              },
      );
    default:
      return Result.flatMap(
        allowedCell(transitions[event._tag], task, event.by),
        ({ to, ifStarted }) =>
          isBeforeItsTime(task, event)
            ? Result.fail("NotYetDue")
            : Result.succeed(
                withoutItsOwnFacts(started ? (ifStarted ?? to) : to, started),
              ),
      );
  }
}

export function transitionTask(
  task: TaskState,
  event: TaskEvent,
): Result.Result<TaskState, TaskRefusal> {
  return Result.mapError(stateAfter(task, event), (_tag) => ({
    _tag,
    state: task.state,
    event: event._tag,
    by: event.by,
  }));
}
