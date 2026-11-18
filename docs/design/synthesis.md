# Design synthesis

Three candidate designs were written from the same brief
([grounding.md](grounding.md)), each by a separate runner. This note records
which one became the base, what was taken from the others, what was corrected,
and what is still open. It is a design decision record, not an implementation
report: nothing here has been built yet.

## Decision

The base is candidate 1: **one program, a pure core, and adapters.**

One Bun program has two entries built from one Effect Layer graph: a
short-lived command entry that agents and people run, and a daemon entry
(scheduler, service). Pure domain modules hold the state machines and decision
functions. Operations sequence those decisions with adapters. Each outside
dependency has exactly one adapter.

Storage is Bun's built-in SQLite, in write-ahead mode with full
synchronisation. Both entries open the same database; a transaction replaces
a file lock. The move from the old install is a clean cutover: the old install
is stopped, today's files are imported once, and no Python process touches the
state after that.

Nathan confirmed SQLite on 2026-11-19.

The proposed architecture is drawn in
[proposed-architecture.mmd](proposed-architecture.mmd), and published at
`https://mermaid.ai/app/projects/940d39a4-c08b-4b93-8c20-857afb8eff8c/diagrams/7acb52c8-1a01-4b8b-acb9-0fd198837222/edit`.
The current system's diagram is in
[current-architecture.mmd](current-architecture.mmd).

## How it was chosen

Six criteria, scored 1 to 5 each, by the orchestrator and by an independent
judge on a different model. The orchestrator recorded its scores before
reading the judge's.

The candidates were written and first scored under an assumption that the new
system must run beside the Python install, sharing today's files. That was the
orchestrator's assumption, not Nathan's decision. He chose a clean cutover on
2026-11-19, and the judge scored again without it. The second scoring was
reasoning from the judge's first read, with no new reading.

| Candidate                 | Orchestrator, first | Judge, first | Judge, clean cutover |
| ------------------------- | ------------------- | ------------ | -------------------- |
| 1. One program, pure core | 27                  | 25           | 27                   |
| 2. Daemon owns all state  | 19                  | 15           | 20                   |
| 3. Event-log core         | 19                  | 19           | 21                   |

Candidate 1 stays first, with the judge's confidence at medium. The deciding
reasons under the clean cutover:

- An agent's `herdr-task ready` never depends on a daemon. In candidate 2 a
  daemon that cannot start stops every agent on the machine.
- Each invariant is held by a type with one owner, and that carries over
  unchanged to SQLite.
- It keeps the rule that no recovery is automatic. Candidates 2 and 3 each add
  automatic recovery steps.
- Its first slice is the smallest: the store and the launch transitions.
- SQLite removes its one weak spot, the file lock through Bun's
  foreign-function interface.

Candidate 2 would be the better base if agents may depend on a live daemon.
This note assumes they may not. Candidate 3 loses most of its case to SQLite,
which already gives atomic changes across tables.

## Grafts

Taken from the other candidates and folded into the base by hand.

- **One attempt state machine** (candidate 3). `Claimed`, `Sending`,
  `Confirmed`, `Refuted`, `Cancelled`, shared by launches, publication stages,
  commands to other machines and message sends. No function retries or cancels
  a `Sending` attempt. Uncertainty is modelled once, in the pure core.
- **Owner start time** (candidate 3). An attempt's owner records its process
  start time beside its process id, so `launch recover` has better evidence.
- **Operation ids for other machines** (candidate 3). Every command sent to
  another machine carries one, with a status lookup that also fences a late
  copy. A lost reply is looked up, never resent blind.
- **One transaction for a confirmed start** (candidate 3, made possible by
  SQLite). Confirming the start, releasing its claim and putting the agent on
  its task happen together. Today's "confirmed but not on its task" repair
  path is deleted.
- **One result envelope** (candidate 2). `Reply`, `Failure` and rendered text
  with a fixed exit code table, for every command. It also keeps a later CLI
  kernel a swap.
- **Resend safety declared per command** (candidate 2).
- **A send permit** (candidate 2). A value only launch admission can make,
  required by the one operation that starts a terminal. It replaces an
  import-boundary lint rule with a type and gives the herdr-core link one
  owner.
- **A crash test per step** (candidate 2). A test stops the process after each
  step of a task start, so the crash table is an executable check.

## Corrections to the base

- **Storage and locks.** The base kept today's JSON files under `flock`.
  With the clean cutover it uses SQLite. The file lock, the pass-through of
  unknown fields and the lock fallback all go. The daemon's single-instance
  lock stays.
- **Import.** Today's files are read once through schemas that describe them
  exactly, then never written.
- **Leaked types.** `LaunchRecord` and `TaskJob` appear on the launch
  admission interface. They move behind it; callers see only the request and
  the outcome.
- **Split ownership of the herdr-core link.** The separate terminal runner
  goes. The herdr-core adapter owns every call, and starting a terminal takes
  a send permit.
- **Grab-bag module.** `operations/assistant` is split by what each part owns
  (chats, asks, spaces, voice) before stubs are written.
- **Transport.** None of the candidates used Bun's native WebSocket server.
  The service's transport becomes one adapter over `Bun.serve`: built-in
  publish and subscribe for live state, `drain` and `pause` for terminal
  backpressure, and an Origin check before every upgrade.

## Rejected

- **The event log itself.** SQLite gives atomic multi-table changes without
  it, and it costs the most to build.
- **The daemon as the only writer.** See "How it was chosen".
- **Automatic cancellation or confirmation of a claim.** Kept as a question
  for Nathan below, not adopted.

## Open questions for Nathan

1. **CLI kernel.** Keep `agent-cli-kernel` code out of the first version and
   design for adopting it later, or use it now? See the uplift list in
   [kernel-uplift.md](kernel-uplift.md).
2. **Agents and the daemon.** This note assumes an agent's command must work
   with the daemon down. If that is wrong, candidate 2 deserves a second
   look.
3. **A claim whose owner is provably dead.** May a `never-submitted` claim be
   cancelled automatically when its owner process is gone? All three
   candidates asked. Today only a person can recover it. The design keeps
   today's rule unless told otherwise.
4. **Done and the Assistant.** The role templates let the Assistant run
   `done` and `accept` when the person asks. Is "only the person marks Done"
   meant to refuse the Assistant, or to allow it as a recorded relay of the
   person's words?
5. **Other machines.** Bun plus one bundled file, or one compiled binary per
   platform? herdr-core's 16 MiB frame cap may force chunked installs either
   way. The thin slice measures both.

## Not verified

- How SQLite behaves when many short-lived command processes write at once,
  and whether `herdr-task ready` stays fast. Only a one-process probe has run
  on Bun 1.4.4.
- Whether herdr-core's `terminal.run` call accepts everything
  `hc run --bg --json --keep` does. The fork never calls it. Checking needs a
  run against a real herdr-core, which is a separate step.
- The Effect 4.1.4 names the candidate sketches mark as unverified.
- Command start time per call, with Effect loaded on every agent `status`.

## Next step

Build the store adapter over SQLite and the pure launch transitions, and prove
them with the launch-admission cases ported from the Python tests. Then the
importer that reads today's files once.

The candidates, the judge's inputs and the kernel fit report are kept in
`~/.local/state/shepherdr-effect-design/`.
