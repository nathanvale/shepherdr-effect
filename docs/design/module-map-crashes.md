# Module map: crashes and other machines

The second half of [module-map.md](module-map.md): which store is the
authority for what, a task start with a crash at each step, and how other
machines are reached without Python. Words follow
[GLOSSARY.md](../../GLOSSARY.md).

## Which store is the authority for what

One fact has one authority. The other side may keep a copy only keyed by the
attempt id.

| Fact                                                                                                                                                      | Authority                                      | Read by                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Whether an attempt's intent was recorded, which effects started and were confirmed, its closure, its attempt owner                                        | The kernel's state add-on journal              | The attempt state, derived on read and never stored elsewhere |
| A launch's attempt id, task assignment, launch revision and recorded binding                                                                              | The journal, in the intent's facts             | Observers and the closure commands                            |
| Task lists, tasks, placements, agent rows, publication records, and the engine's other state (news, held messages, reach map, machine holds, automations) | The store                                      | Every procedure                                               |
| Which launch put an agent on its task                                                                                                                     | The store: the agent row carries its launch id | `assignAgent`, which is why a re-run changes nothing          |
| Settings                                                                                                                                                  | The settings file                              | `Settings`                                                    |
| Terminals, terminal labels, shared documents                                                                                                              | herdr-core                                     | `HerdrCore`, and the live view, which never stores them       |

A task launch declares two effects to the kernel: starting the terminal, and
the task assignment. The kernel records completion only when every declared
effect is confirmed, so a run that confirms the terminal and then fails to
write the task assignment leaves an unresolved case instead of a silent gap.
The task assignment's read-back is reading the agent row by launch id.

## A task start, step by step

`herdr-task start HAT-4` from the command entry, or a tick starting a queued
task (see open question 1 in [module-map.md](module-map.md)). The live run
confirms on positive evidence it reads itself. After a crash the person runs a
closure command: `launch recover` for an Intended attempt and
`launch reconcile` for an Uncertain one, which needs positive evidence. The
person may also refute an Uncertain attempt, closing it as not applied, only
on evidence that herdr-core can no longer apply its request. A confirmed
launch missing its task assignment is the one case the next tick
finishes on its own, by the default in [launch-admission.md](launch-admission.md);
`launch reconcile` still does the same for the person.

| Step                    | What happens                                                                                                                                                                 | Journal after a crash here                      | Store after a crash here        | How it is resolved                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Preflight            | Strict settings read, launch plan, launch revision, a look for an unresolved attempt with this conflict key                                                                  | nothing new                                     | nothing new                     | Nothing to do.                                                                                                                                                                                                                                                                                                                    |
| 1. Intent               | Start admission takes the conflict key; the kernel flushes the intent: attempt id, task assignment, launch revision, recorded binding, attempt owner and its start time      | intent only: Intended                           | nothing new                     | A second start refuses. The person runs `launch recover`, closing it as `not-applied`: Cancelled (open question 3).                                                                                                                                                                                                               |
| 2. Prepare step         | `Git` makes or adopts the worktree; `recordPlacement` in one store transaction; the brief                                                                                    | intent only                                     | placement recorded              | As step 1. The next start adopts the worktree and placement.                                                                                                                                                                                                                                                                      |
| 2a. Refused before send | The prepare step fails, the launch revision changed, or the caller interrupts                                                                                                | the run's own `not-applied`                     | placement stays                 | The run itself: Cancelled, since no effect started. The worktree stays the task's, as today.                                                                                                                                                                                                                                      |
| 3. Send                 | The kernel flushes `effect-started` and calls the effect; launch admission makes the send permit there; `HerdrCore` starts the terminal labelled `herdr.launch=<attempt id>` | `effect-started`: Uncertain                     | placement                       | Nothing retries it. `launch reconcile` looks once for exactly one terminal with that label. Found: step 5's re-run, then the closure. None or several: it stays Uncertain for the person. It closes as not applied only on evidence that herdr-core can no longer apply the request ([launch-admission.md](launch-admission.md)). |
| 3a. Refuting reply      | herdr-core's reply proves nothing reached it                                                                                                                                 | `effect-unconfirmed`                            | placement                       | Refuted in the domain core. The journal holds the refuting record. Whether the run or the person then closes the kernel case is open question 7.                                                                                                                                                                                  |
| 4. Confirm              | The terminal effect's read-back is `observeLaunch`: the address in the reply, or one labelled terminal; the kernel flushes `effect-confirmed`                                | terminal confirmed; task assignment not started | placement; no agent on the task | The next tick, or `launch reconcile`, re-runs the task assignment (step 5) from the intent's task assignment and the observation's terminal address, then closes as `completed`.                                                                                                                                                  |
| 5. Task assignment      | The second effect: `assignAgent` writes the agent row (launch id, terminal address) and the stored state `running` in one store transaction; its read-back reads the row     | task assignment started                         | the agent on its task           | The same re-run: `assignAgent` finds the launch id already there and changes nothing; its read-back confirms; then the closure.                                                                                                                                                                                                   |
| 6. Completion           | Both effects confirmed; the kernel flushes `completion`                                                                                                                      | resolved                                        | the agent on its task           | Nothing.                                                                                                                                                                                                                                                                                                                          |
| 7. Best effort          | The session watch and the log record                                                                                                                                         | resolved                                        | as step 6                       | A later tick pass.                                                                                                                                                                                                                                                                                                                |

The re-run of step 5, keyed by the attempt id and then closed, is the one
step that spans both stores. It is idempotent, so the tick and a person may
both run it, in either order.

An Assistant launch, a tab agent or a utility launch runs steps 0, 1, 3, 4
and 6: it declares one effect and has no task assignment. A revival's positive
evidence is an agent running in the terminal it typed into; a remote job's is
its result files.

A crash test (the graft from design candidate 2) stops the process after each
step and checks the journal and the store against this table, with both on a
temporary folder.

Changed from the base, then back: the base let the tick repair a
confirmed-but-not-on-its-task start on its own, this note first gave that
only to the person's closure command, and the default in
[launch-admission.md](launch-admission.md) gives it back to the tick. Its
single store transaction for a confirmed start now covers only the agent row
and the stored state; confirmation lives in the journal.

## Other machines, without Python

Each machine has its own store, its own kernel journal and its own scheduler.
Nothing writes another machine's store. Logic runs here; only plain commands
run there, and this program runs there only for that machine's own state.

1. **Machine facts.** `RemoteMachines` runs plain commands there through
   `HerdrCore` (`hc machine ls --json`, `hc ls --json`,
   `hc server status --json`, `uname -sm`, `sysctl`, `df`) and parses the
   output here, for `probeHealth` and the reach map. Further hops run a nested
   `hc exec --on` from that machine; that this works through a machine link is
   not verified. This replaces the Python source the old system piped over
   `hc exec`.
2. **Remote install** (`ensureInstalled`):
   - read the platform once;
   - write the Bun 1.4.4 runtime for that platform once per Bun version, then
     check its `--version`;
   - write one bundle per release, named by its content digest;
   - write a two-line POSIX shell shim at `~/.local/bin/herdr-task` that runs
     the bundle with that runtime;
   - record the digest in the install marker (open question 10).

   Writes go through `hc file write --on <machine>`, in chunks under
   herdr-core's 16 MiB frame cap.

3. **Remote commands** (`--on <machine>`). `relayCommand` runs the shim there.
   A command whose resend safety is `safe` just runs. A command marked `once`
   is an attempt here: its intent carries the attempt id, the command runs
   there with `--op <attempt id>`, and the program there records that attempt
   id with its change in one store transaction. A lost reply is never resent:
   a lookup by attempt id there answers applied, with the stored result as
   positive evidence (Confirmed), or not applied, and then records the attempt
   id as refused so a late copy changes nothing (Refuted).
4. **Remote jobs.** A long action is a utility launch through launch
   admission, launch identity `job:<machine>/<job id>`. Its terminal's shell
   writes `.out`, `.err` and `.rc` there; this side reads them with `test -f`
   and `cat`, and they are its positive evidence. After about 25 seconds the
   command answers that the result is late, and
   `herdr-task --on <machine> _job <id>` follows it.
5. **Plan limits** need each agent CLI's own usage files, so the installed
   program reads them there.
6. **Bundle or compiled binary** is open question 5. Design candidate 1
   estimated a compiled binary at about 60 MB per release against about 1 MB
   for a bundle; `RemoteMachines` hides the choice.

What goes: the Python zipapp, Python source piped over `hc exec` and the
Python poll script.
