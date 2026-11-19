# Launch admission: own what a launch runs

What the architecture review of 19 November 2026 decided for launch admission.
Nothing here is built. Words follow [GLOSSARY.md](../../GLOSSARY.md). This note
changes [module-map.md](module-map.md) and
[module-map-crashes.md](module-map-crashes.md); the changes are listed under
"What moves in the module map".

Nathan chose to explore this deepening on 19 November 2026 and then asked the
review to keep going. Every decision below is the review's default, except
the rules under "What Shepherdr owes the kernel", which Nathan decided. The
defaults that are his to change are under "Defaults Nathan can change".

## Why deepen it

- The planned interface takes a launch request and the caller's own prepare
  step. The glossary names the parameter `prepare`. So every caller must know
  the admission order, and what its own steps leave behind after a crash.
- The old `Admission` has the same shape: a `claimed()` block that the caller
  fills, and a `before_send` hook that exists so a switch can end the old
  agent at the right moment.
- `commands.py` and `launch.py` changed together in 13 commits since
  4 November 2026. Five of the last 30 changes touch launch admission and the
  task commands together.
- `launch.py` (990 lines) and `revive.py` (591 lines) build the words an
  agent runs, its labels and its brief. The module map names a home only for
  "the send".

## The fourteen kinds of launch in the old system

| Kind                                   | Through admission today                    |
| -------------------------------------- | ------------------------------------------ |
| Task start                             | Yes                                        |
| Queued start by the tick               | Yes                                        |
| Start by an automation                 | Yes                                        |
| Resume, and a start from a message     | Yes                                        |
| Switch                                 | Yes, with the hook that ends the old agent |
| Backup                                 | Yes                                        |
| Assistant start                        | Yes                                        |
| Tab agent                              | Yes                                        |
| Restart of an Assistant or a tab agent | Yes                                        |
| Revival into a kept terminal           | Yes, typed into the terminal               |
| Conversation fork                      | Only its preflight                         |
| Reviewer                               | No. The worker starts it with `hc run`     |
| Scheduler terminal                     | No                                         |
| Remote job                             | No                                         |

## Decisions

| Decision                                                                                                                                                                                        | Why                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A caller passes a launch request in task words and nothing else. Launch admission owns every step between the intent and the task assignment. The `prepare` parameter goes.                     | The order, and what a crash leaves behind, then have one owner. The crash table becomes one module's test. |
| Launch admission builds the words an agent runs: the agent CLI, its model and effort, hooks, permissions, a clean environment, the labels and the tab name.                                     | These change with the launch, not with the task. Today five callers each build part of them.               |
| The task-side decisions stay pure in Task: which worktree, branch and start commit a task gets, and the words of its brief. Launch admission asks Task for them and runs the steps.             | Placement and the brief are Task knowledge. When they run is launch knowledge.                             |
| Everything a task start writes about the task goes in one store transaction: the placement, the stored state `running`, and the review fields. A later start adopts all of it or none.          | Today a later start cannot adopt the review fields or a backup's state.                                    |
| Each step reads what exists before it acts. A worktree that is already there is adopted. An old agent that has already ended is left alone.                                                     | A repeated start then finds nothing left to do.                                                            |
| Resume, switch, restart, revival and backup are kinds of launch request. A switch's "end the old agent" is a step inside launch admission, after the last check and before the terminal starts. | It removes the caller's hook.                                                                              |
| All fourteen kinds go through launch admission: the reviewer, the scheduler terminal, remote jobs and conversation forks included.                                                              | The invariant "no terminal starts outside launch admission" already says so.                               |
| The worker asks Shepherdr to start its reviewer. It no longer runs `hc run` itself.                                                                                                             | A review round counts only when the Reviewer records its own result (see [completion.md](completion.md)).  |
| Launch admission answers what an agent runs on now, and what it could run on.                                                                                                                   | Seven actions about the model menu and restart have no home in the module map.                             |
| Launch (domain core) stays pure and becomes the inside of this module: launch identity, launch revision and the kinds of launch request.                                                        | It has one caller. It is launch admission's vocabulary.                                                    |

## Where the kernel shows through

In the kernel at `4be9a37` a command's handler opens its own transaction from
its run's context. So a launch can run only inside a kernel command run.

- Tick procedures and the transport do not call launch admission as a plain
  Effect service. Each launch they start is its own kernel run in the same
  process, as decided on 19 November 2026 for the daemon.
- The invariant "the kernel flushes the intent before handler entry" in
  [module-map-invariants.md](module-map-invariants.md) should read "before
  the work runs".

## What Shepherdr owes the kernel

Decided by Nathan on 19 November 2026 at 13:46 AEDT, for the kernel's journal
version 2 (open points X and Y). Shepherdr opens herdr-core's socket itself,
so the kernel never starts a program for it. The kernel checks none of the
rules below. Shepherdr's own tests prove them.

- **The herdr-core link opens outside every recorded effect.** It is never
  opened inside a `record` call. So no operation Shepherdr leaves records a
  delegate start, and the kernel can close a crashed case without waiting
  for the machine to restart.
- **Work sent through the link for an operation cannot outlive its attempt
  owner unseen.** One of these holds, and a test covers each:
  - herdr-core drops a request whose sender's connection has gone, so the
    work ends when its owner ends; or
  - Shepherdr's observer answers `unobservable` for that operation while
    such work may still be pending.
- Without that rule a closer could find the owner lease free, observe no
  labelled terminal, close the case as not applied, and herdr-core could
  still start the terminal afterwards.
- **Every effect stops at the handler's deadline.** The kernel makes a
  transaction wait for every `record` call it started. In the daemon a call
  that never settles keeps its case unresolved, and its conflict key
  blocked, until the process ends. So launch admission passes the handler's
  abort signal (`context.signal`) into each effect, and an effect that is
  interrupted ends its herdr-core request.

Whether herdr-core drops a request when its sender's connection closes is not
known. The old client never relied on it. Until a test against a real
herdr-core shows it does, the observer answers `unobservable` for an
operation whose request was sent and not answered.

## Who may finish a launch that its own run did not

Two cases, with different defaults.

| Case                                                                                     | Default                                                                       | Why                                                                                                   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Uncertain.** The terminal may or may not have started.                                 | Only the person closes it, with a closure command.                            | This is the old system's rule: nothing calls recover or reconcile by itself.                          |
| **Confirmed, but the agent is not on its task.** The journal shows the terminal started. | The next tick re-runs the task assignment and closes the launch as completed. | The old tick does this today. The assignment is keyed by the attempt id, so a repeat changes nothing. |

The crash table in [module-map-crashes.md](module-map-crashes.md) follows
the second default.

Either way the kernel closes a launch only when it can show that the run that
recorded it has stopped. An Intended launch whose attempt owner is gone stays
the person's to close, as [synthesis.md](synthesis.md) leaves it.

Running unattended, an Uncertain launch stops its task until the person
returns. The morning report lists it.

## What moves in the module map

| Planned module                    | Change                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Launch admission                  | Takes a launch request alone. Owns the prepare step, the words to run, and every kind of launch.                |
| Launch, `src/domains/launch/`     | Stays pure, as the inside of launch admission.                                                                  |
| Task procedures                   | `start`, `resume` and `switch` keep the task-side checks, then make one call. They build no words and no steps. |
| Tick procedures, Space procedures | Start launches as kernel runs. They build no words.                                                             |
| Machine procedures                | A remote job is a utility launch.                                                                               |
| Provider route                    | Still makes the launch plan. Launch admission turns the plan into words.                                        |
| herdr-core link                   | Unchanged. A terminal start still takes a send permit.                                                          |

Every entry in `inventory/*.json` still maps to exactly one module. `start`,
`resume` and `switch` stay with Task procedures. The actions `restart-info`,
`role-info`, `mode`, `model-menu` and `model-pin`, which have no home today,
map to launch admission.

## Tests

- The crash test stops the process after each step of a task start and checks
  the journal and the store against the crash table. It runs through launch
  admission's interface alone.
- The old system's `test/test_launch_admission.py`, `test/test_restart.py`
  and `test/test_native_restart.py` describe this module's behaviour. Port
  their cases to the interface, with the herdr-core link's test layer and
  real git in a temporary repository.

## Defaults Nathan can change

| Default                                                         | The alternative                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Only the person closes an Uncertain launch                      | The next tick confirms it on exactly one terminal labelled with its attempt id, and never cancels it. |
| The next tick re-runs a confirmed launch's task assignment      | Only the person's closure command does. Then the crash table goes back to that.                       |
| Shepherdr starts the reviewer when the worker asks              | The tick starts a reviewer for every task that says ready, with no request from the worker.           |
| `start`, `resume` and `switch` stay commands of Task procedures | They become launch admission's commands. Then the task-side checks move with them.                    |

## Not verified

- Whether herdr-core's `terminal.run` call accepts everything
  `hc run --bg --json --keep` does. [synthesis.md](synthesis.md) lists the
  same gap.
- Whether one module can hold the words for both agent CLIs and stay under
  the file size check. The old code spends about 1,500 lines on them.

## Glossary changes this needs

- **Prepare step** becomes a step of launch admission, not the caller's own
  effects, and loses the parameter `prepare`.
- **Launch request** gains kinds for resume, switch, restart, backup and the
  reviewer, or says which existing kind each one is.
- **Closure command** should say that a confirmed launch's task assignment
  may be re-run by the tick.
