# Design synthesis

Three design candidates were written from the same brief
([grounding.md](grounding.md)), each by a separate runner. This note records
which one became the base, what was taken from the others, what was corrected,
and what is still open. It is a design decision record, not an implementation
report: nothing here has been built yet.

## Decision

The base is candidate 1: **one program, a pure core, and adapters.**

One Bun program has two entries built from one Effect Layer graph: a
short-lived command entry that agents and people run, and a daemon entry
(scheduler role, service role). Pure domain modules hold the state machines
and decision functions. Procedures sequence those decisions with adapters.
Each outside dependency has exactly one adapter.

Storage is Bun's built-in SQLite, in write-ahead mode with full
synchronisation. Both entries open the same database; a store transaction
replaces a file lock. The move from the old install is a clean cutover: the
old install is stopped, today's files are imported once, and no Python process
touches the state after that.

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

The design candidates were written and first scored under an assumption that
the new system must run beside the Python install, sharing today's files. That
was the orchestrator's assumption, not Nathan's decision. He chose a clean
cutover on 2026-11-19, and the judge scored again without it. The second
scoring was reasoning from the judge's first read, with no new reading.

| Design candidate          | Orchestrator, first | Judge, first | Judge, clean cutover |
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
- It keeps the rule that no closure is automatic. Candidates 2 and 3 each add
  automatic closure steps.
- Its first slice is the smallest: the store and the launch transitions.
- SQLite removes its one weak spot, the file lock through Bun's
  foreign-function interface.

Candidate 2 would be the better base if agents may depend on a live daemon.
This note assumes they may not. Candidate 3 loses most of its case to SQLite,
which already gives atomic changes across tables.

## Grafts

Taken from the other design candidates and folded into the base by hand.

- **One attempt state machine** (candidate 3). `Intended`, `Uncertain`,
  `Confirmed`, `Refuted`, `Cancelled`, shared by launches, publication stages,
  commands to other machines and message sends. No function retries or cancels
  an `Uncertain` attempt. Uncertainty is modelled once, in the pure core.
- **Attempt owner start time** (candidate 3). An attempt's owner records its
  process start time beside its process id, so `launch recover` has better
  evidence.
- **Attempt ids for other machines** (candidate 3). Every command sent to
  another machine carries one, with a status lookup that also fences a late
  copy. A lost reply is looked up, never resent blind.
- **One store transaction for a confirmed start** (candidate 3, made possible
  by SQLite). Confirming the attempt and recording the task assignment happen
  together. Today's "confirmed but not on its task" repair path is deleted
  for as long as both live in one store; it returns in a smaller form if the
  kernel's journal holds the attempt (see [kernel-uplift.md](kernel-uplift.md)).
- **One result envelope** (candidate 2). `Reply`, `Failure` (the CLI kernel's
  result) and rendered text with a fixed exit code table, for every command.
  It also keeps a later CLI kernel a swap.
- **Resend safety declared per command** (candidate 2).
- **A send permit** (candidate 2). A value only launch admission can make,
  required by the one herdr-core call that starts a terminal. It replaces an
  import-boundary lint rule with a type and gives the herdr-core link one
  owner.
- **A crash test per step** (candidate 2). A test stops the process after each
  step of a task start, so the crash table is an executable check.

## Corrections to the base

- **Storage and locks.** The base kept today's JSON files under `flock`.
  With the clean cutover it uses SQLite. The file lock, the pass-through of
  unknown fields and the lock fallback all go. The daemon lock stays.
- **Import.** Today's files are read once through schemas that describe them
  exactly, then never written.
- **Leaked types.** `LaunchRecord` and `TaskJob` (a task assignment) appear on
  the launch admission interface. They move behind it; callers see only the
  request and the outcome.
- **Split ownership of the herdr-core link.** The separate terminal runner
  goes. The herdr-core adapter owns every call, and starting a terminal takes
  a send permit.
- **Grab-bag module.** `operations/assistant`, the assistant procedure, is
  split by what each part owns (chats, asks, spaces, voice) before stubs are
  written.
- **Transport.** None of the design candidates used Bun's native WebSocket
  server. The service role's transport becomes one adapter over `Bun.serve`:
  built-in publish and subscribe for live state, `drain` and `pause` for
  terminal backpressure, and an Origin check before every upgrade.

## How the state file check reads a file

- The registry is searched in order and the first entry that matches a path is
  its entry, so every named file comes before the task list pattern.
- A round trip decodes a document, encodes it back and compares the two. A
  file nobody here writes is only decoded: its schema models part of it, so it
  could never come back whole.
- A file with no registry entry is never opened; only its name is reported.
- A finding or a pointer never carries a value from a document. A key the
  schema declares is structure and is shown; a key an open record admits is
  data (a task number, a machine name), so it is printed as `*`.
- A key the schema does not know in a closed object is shown, since it is a
  name and not a value.
- The same failure in many entries of an open record is reported once.
- `state check` writes nothing and lets no file content leave the command.
- A registry entry names its file by a path from the state root with `/`
  between its parts, or by a pattern over such paths. A lock path is from the
  file's own folder.
- In a `json-lines` file every line is one document of the schema. Only the
  final newline is dropped before the lines are read, so an empty line
  anywhere else is a finding.
- `listRegularFiles` returns regular files only, as paths from the state root.

## How the inventory reads and keeps its lists

- The extractors read tokens, not syntax trees. A token is one word of source
  text: enough to find calls, comparisons and blocks.
- Both token readers drop comments. A script's `/` is a division after a value
  and the start of a regex after an operator or one of a few words (`return`,
  `typeof`), so the reader decides from the token before.
- A file whose brackets do not pair up was read wrongly or is not whole. A list
  taken from it would be quietly short, so it is refused by name.
- A list's name is its file's name: `inventory/<name>.json`. A list is in id
  order, one code unit at a time, each id once.
- State files are not an inventory list. `src/state-files/registry.ts` is their
  one list, so they are taken from it each time and no file of them is kept. An
  entry that matches by pattern is named by its pattern.
- `--fork PATH` and nothing else names a fork, and no arguments name none.
  Anything else is a usage refusal.
- `inventory extract` writes only a file whose text would differ, so a second
  run finds nothing to write, and it writes nothing outside `inventory/`.
- `inventory check` reads a kept file through its list's schema, and a key the
  schema does not name breaks it as a wrong value does. One file that is
  missing, broken or unknown fails the check.
- A list can differ in every item, so a failure names a few ids and counts the
  rest.
- The tests' fixtures are hand-written and made up: the fork's files hold the
  shapes one extractor must read, with the cases that are easy to get wrong,
  and the state files hold made-up values, one or more for each schema. None of
  it is the real fork's or the pilot's text.
- The command line tests use `inventory check` as their real command: it runs
  with no arguments, changes nothing and reads only committed files.

## Rejected

- **The event log itself.** SQLite gives atomic multi-table changes without
  it, and it costs the most to build.
- **The daemon as the only writer.** See "How it was chosen".
- **Automatic cancellation or confirmation of an unresolved attempt.** Kept as
  a question for Nathan below, not adopted.

## Open questions for Nathan

1. **CLI kernel.** Keep `agent-cli-kernel` code out of the first version and
   design for adopting it later, or use it now? See the uplift list in
   [kernel-uplift.md](kernel-uplift.md).
2. **Agents and the daemon.** Decided by Nathan on 2026-11-19: an agent's
   command must always work with the daemon down. This settles the base
   choice over design candidate 2.
3. **An intended attempt whose owner is provably dead.** May an `Intended`
   attempt be cancelled automatically when its attempt owner is gone? All three
   design candidates asked. Today only a person can close it. The design keeps
   today's rule unless told otherwise.
4. **Done and the Assistant.** Decided by Nathan on 2026-11-19: the Assistant
   may mark a task Done. The role templates already let it run `done` and
   `accept` when the person asks. It does so only when the person asks, never
   on its own judgement, and the task records that the Assistant relayed the
   request. A worker or a reviewer still cannot mark Done. Also decided by
   Nathan on 2026-11-19: Completion marks a task Done once its integration is
   confirmed, and the task records why, because otherwise every unattended
   merge stalls the tasks queued behind it.
5. **Other machines.** Bun plus one bundled file, or one compiled binary per
   platform? herdr-core's 16 MiB frame cap may force chunked installs either
   way. The thin slice measures both.

## Not verified

- How SQLite behaves when many short-lived command processes write at once,
  and whether `herdr-task ready` stays fast. Only a one-process probe has run
  on Bun 1.4.4.
- Whether herdr-core's `terminal.run` call accepts everything
  `hc run --bg --json --keep` does. The old system never calls it. Checking
  needs a run against a real herdr-core, which is a separate step.
- The Effect 4.1.4 names the design candidates' sketches mark as unverified.
- Command start time per call, with Effect loaded on every agent `status`.

## Next step

Build the store adapter over SQLite and the pure launch transitions, and prove
them with the launch-admission cases ported from the Python tests. Then the
importer that reads today's files once.

The design candidates, the judge's inputs and the kernel fit report are kept in
`~/.local/state/shepherdr-effect-design/`.
