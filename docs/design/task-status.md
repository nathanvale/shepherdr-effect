# Task status: one read in place of three gatherers

What the architecture review of 19 November 2026 decided for how a task's
status is found. Nothing here is built. Words follow
[GLOSSARY.md](../../GLOSSARY.md). This note changes
[module-map.md](module-map.md); the changes are listed under "What moves in the
module map".

Nathan chose to explore this deepening on 19 November 2026 and then asked the
review to keep going. Every decision below is the review's default. The ones
he is most likely to want a say in are under "Defaults Nathan can change".

## Why one module

- `deriveTaskStatus` is pure, so each caller must first gather a task's live
  agents, read its session logs and apply the grace timing. The module map
  has three such callers: Task procedures, Tick procedures and Live view.
- The old system has the rule twice. `task_status` in `agents.py` gathers and
  derives. `place` in `core/tasks.js` derives from facts the scheduler wrote
  onto the task every 15 seconds. Three case files hold the two in step.
- `agents.py` is 1,008 lines and has no home in the module map.
- `core/tasks.js` and `agents.py` changed together in 13 commits since
  4 November 2026. `output.py` changed with `core/tasks.js` in all 6 of its
  commits.

## What the old system reads for one status

| Source                     | What it gives                                                                  |
| -------------------------- | ------------------------------------------------------------------------------ |
| The task                   | Stored state, attention, retry, review and ready times, merge fields, progress |
| herdr-core, for each agent | Status, turn, how long in that status, role, the foreground program            |
| The agent's session log    | Its own work in the background, its last question, when its turn began         |
| The terminal's screen      | Whether the agent CLI asks to trust the folder                                 |
| The chat's request files   | Whether an ask is held for the person                                          |
| The process table          | Whether a Codex agent still works                                              |
| The clock                  | The 20 second grace before Needs you                                           |

One status in the old Python costs one list of terminals, one read for each
agent, and tails of the session logs.

## What the module owns

- **One question: what is this task's status, and why.** The answer is the
  status, what the task needs from the person, the reason in a line, and the
  time at which the answer will change by itself (the end of a grace).
- **The gathering.** Callers pass a task. The module reads herdr-core, the
  session logs, the screen and the process table.
- **The pure rule.** `deriveTaskStatus` stays in Task as it is planned. It is
  the module's internal seam, and its tests are the 36 case-file cases that
  need no log.
- **A task's plain JSON output and its one line.** Agents, role templates and
  the chat read that output, and its words cannot change. Seven of its fields
  come from the status. It moves here from Result.
- **A stream of status changes.** Live view and news subscribe. The module
  watches herdr-core's events, the store's changes and its own grace timers,
  so no caller keeps a timer.

## Decisions

| Decision                                                                                                                                                                                           | Why                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Gathered facts are never written to the store. The old scheduler wrote `own_work`, `waits`, `trust_ask` and `held_ask` onto the task for the JavaScript to read. One program has no second reader. | The glossary says a task status is never stored. A read that writes also takes the store's write lock. |
| A read never writes. The old view paused and resumed the progress clock while it printed a task. That update moves to the tick.                                                                    | A read that changes state gives two runs different answers.                                            |
| The daemon keeps gathered facts in memory, with the offsets it has reached in each session log. A command gathers fresh, for the tasks it prints only.                                             | A command must work with the daemon down, so it cannot depend on the daemon's memory.                  |
| Reading the agent CLIs' session logs is one adapter of its own. Task status and Conversation procedures both use it.                                                                               | The module map gives that file read no owner. Two agent CLIs write two formats.                        |
| The status of a task on another machine is derived on that machine, and arrives here as that machine's plain JSON output.                                                                          | Each machine has its own store, herdr-core and session logs.                                           |
| Completion writes a task's attention. Task status only reads it.                                                                                                                                   | Attention is a forge fact: failing checks, a conflict, a closed pull request.                          |

## Who calls it

| Caller          | For what                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Task procedures | `list`, `show`, `status`, `where`, and the reply of `add`, `start` and `ready` |
| Tick procedures | Queued starts, the retry pass, automation events                               |
| Live view       | The snapshot, and the stream of changes                                        |
| Completion      | Whether an agent is in the middle of a turn, before cleanup removes a worktree |
| News            | The stream of changes, told to the space's Assistant                           |

## What moves in the module map

| Planned module                   | Change                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| New: the task status module      | A procedure with no outside system of its own. Its folder and name are not chosen. |
| New: the session log adapter     | Alone reads the agent CLIs' session logs.                                          |
| Task, `deriveTaskStatus`         | Stays pure. Its callers become one.                                                |
| Task procedures, Tick procedures | Stop gathering. They ask the task status module.                                   |
| Live view                        | Stops merging herdr-core events with store changes for tasks. It subscribes.       |
| Conversation procedures          | Reads session logs through the new adapter.                                        |
| Result                           | Keeps the kernel's envelope. A task's plain JSON output moves to the new module.   |

Every entry in `inventory/*.json` still maps to exactly one module. `status`,
`list`, `show` and `where` stay with Task procedures. `/api/state` and
`/api/ws` stay with Live view.

## Tests

- The three case files (`core/grace.cases.json`, `core/on-it.cases.json`,
  `core/back-to-work.cases.json`) run against the module's interface, the 12
  cases with a session log included. They use the herdr-core link's test
  layer and log files in a temporary folder.
- The same 36 cases that need no log also run against `deriveTaskStatus`.
- One test prints a task's plain JSON output and compares it with a fixture
  taken from the old system, because agents read it.

## Defaults Nathan can change

| Default                                                     | The alternative                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A command gathers fresh every time                          | A command reads the daemon's facts when the daemon is up. Faster, but two paths to test.                        |
| The task's plain JSON output keeps today's fields and words | Change the output and the role templates together. The glossary says an agent-facing command's output is fixed. |
| Asks are read where the old system reads them               | Wait for the asks area, which the module map lists as not designed.                                             |

## Not verified

- How long one fresh status takes in a command. The old `herdr-task status`
  already misses the latency limit proposed in
  [store-sqlite.md](store-sqlite.md), and an agent runs it every five minutes.
- The first scan of a long session log reads up to 64 MB in the old system.
  Whether a short-lived command can afford that scan is not measured.

## Glossary changes this needs

- A name for the module. `TaskStatus` is already the type of the answer.
- A name for the session log adapter.
- **Task status** should say that its answer carries the time at which it
  will change.
