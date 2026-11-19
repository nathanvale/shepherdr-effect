# Adapter seams: what is assumed and what is open

The second half of [adapter-seams.md](adapter-seams.md). Words follow
[GLOSSARY.md](../../GLOSSARY.md).

## What the CLI kernel journal assumes about the kernel

`CliKernelJournal` was written from [kernel-uplift.md](kernel-uplift.md) and
[launch-admission.md](launch-admission.md), and brought in line with the
merged launch rule on 19 November 2026. The kernel's code was not read for
it, except where a line says so. Each line is something the interface needs
the kernel to do, or to let Shepherdr do. The number in brackets is the item
in kernel-uplift.md, where one applies. "Seam only" marks what no note says
the kernel does.

1. The attempt id is in the intent's facts, as
   [module-map-crashes.md](module-map-crashes.md) has it. Seam only: an
   attempt is found again by its attempt id, and the kernel's operation id
   never crosses the seam. Item 2 asks only for the operation id before the
   effect runs.
2. The caller names the attempt owner in the intent: machine, process id and
   process start time.
3. An intent declares its effects by name, and its facts are JSON. Seam only:
   it also says for each effect whether it is keyed by the attempt id
   (`keyedByAttemptId`). If the kernel cannot carry that, it goes in the
   facts.
4. A conflict key is a string the kernel accepts. Encoding a launch identity
   into one is Launch's work, not the seam's.
5. `begin` refuses a conflict key that an unresolved attempt holds, in the
   same step that records the intent, and the intent is flushed before
   `begin` returns.
6. `begin` can be called many times in one process (item 7).
7. `record` flushes `effect-started` before the effect is called.
8. Interrupting `record` interrupts the effect and leaves it Uncertain. Item
   9 says the kernel's handlers get no abort signal. launch-admission.md has
   launch admission pass `context.signal` into each effect. Seam only: the
   effect is an Effect program.
9. The observer runs once, after the effect, in the same run. Positive
   evidence is flushed as `effect-confirmed` and refuting evidence as
   `effect-unconfirmed`. No evidence, or `Unobservable`, flushes nothing.
10. Only the run that began an attempt calls `record` for it. A later run
    uses `close`.
11. The kernel records completion by itself once every declared effect is
    confirmed.
12. `close` offers `completed` and `not-applied`, not the kernel's
    `outcome-unknown`. An Uncertain effect closes only on evidence: positive
    evidence as `completed`, or the person's refuting evidence as
    `not-applied`. That the kernel takes refuting evidence at a closure, as
    its observer's `excluded`, is the review's reading in
    launch-admission.md.
13. Closing as `completed` accepts a closer's positive evidence for an effect
    its owner never started, only when that effect is keyed by the attempt
    id. The tick's re-run of a task assignment depends on this. Any other
    effect that never started is refused.
14. Closing as `not-applied` is accepted when every declared effect is
    Intended, Refuted, or Uncertain with the person's refuting evidence for
    it. An Uncertain effect without that evidence refuses the closure.
15. The kernel alone proves that an attempt owner has stopped (item 1). The
    seam has no entry for it. It has the error `AttemptOwnerMayBeRunning`,
    which a closure by any other run gets until the kernel can show the stop.
16. `unresolved` reads every unresolved attempt, or those of one conflict key
    (item 3).
17. Opening the herdr-core link outside every `record` call is the caller's
    rule. The seam cannot check it.
18. A closure says who closes: the attempt owner's own run, the person or the
    scheduler. The seam believes it. The kernel must know which run calls.

## Where a seam allows more than an open question

- **Closing a Refuted launch.** `close` accepts `not-applied` for a Refuted
  effect from the attempt owner's own run and from the person. Open question
  7 of [module-map.md](module-map.md) asks which of the two may. Nathan has
  not answered it. Until he does the seam allows both, which is more than
  either answer would.

## Not held, and not verified

- One recorded effect makes one start, and `observeStartReply` is true only
  then. `CliKernelJournal.record` refuses to perform an Uncertain effect
  again, and one `SendPermitMaker` lets the link spend one permit for each
  attempt id. A second maker, as in a restarted process, keeps no record of
  the first: it can make a permit for an attempt id that already started a
  terminal, and then the reply to that start is read as the first start's
  answer. The journal's row for the effect is what would have to refuse it.
- Anything can build refuting evidence. The seam checks only that it names
  the attempt. No herdr-core call is known to show that a request can no
  longer apply, so the person has no source for it yet and the dead end of
  launch-admission.md stays.
- An interrupted start ends its request on the link only. Whether herdr-core
  can be told to drop a request is not known.
- `observeLaunch` cannot answer that nothing is there. In the kernel at
  `08d71e7` (`classOf` in `kernel/src/addons/state/install.ts`, read on
  19 November 2026) an effect that never started is classed `remaining` when
  its observer answers `absent`, and `uncertain` when it answers
  `unobservable`. So the observer Shepherdr gives the kernel may need more
  than `observeLaunch`. What a `not-applied` closure needs was not read, and
  nothing was checked against journal version 2.
- A launch closed on refuting evidence leaves `unresolved`. No test reads it
  back as Refuted, because the test layer keeps no closed attempts.

## Where the design notes disagree

- **The forge seam.** [module-map.md](module-map.md) has two services with
  three entries each. [completion.md](completion.md) has one interface for
  reading and publishing, merging as a separate ability, and an in-memory
  adapter. Built: one shared interface of three entries, satisfied by both
  services, with `merge` on GitHub only. The test layer is the in-memory
  adapter.
- **Publication stages.** The glossary and module-map.md give stages to
  Bitbucket alone (`push`, `draft`, `ready`). completion.md gives every forge
  kind stages. Built: `open` for GitHub, `draft` and `ready` for Bitbucket.
  The push is `Git.pushBranch`, observed by `Git.readRemoteBranch`.
- **Launch admission's entries.** module-map.md lists four and the glossary a
  `prepare` parameter; launch-admission.md removes the parameter. Nothing
  built here depends on either.
- **Git in tests.** completion.md and launch-admission.md test procedures on
  real git in a temporary repository. The unit asked for a `layerTest` on
  every seam, so `Git` has one.
- **Closure dispositions.** The glossary lists three. The journal offers two
  (assumption 12).
- **The session log adapter** of [task-status.md](task-status.md) is not in
  the module map's table and is not built.

## Types that wait for a home in the domain core

Each is the smallest local type its seam needed. None is unforgeable yet.

| Type                                                            | Where it is now                                                       | Its maker, once built             |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| `MatchedRepository`, `MergePermit`, `CheckObservation`          | `forge/forge.ts`                                                      | `matchRepository`, `decideMerge`  |
| `attemptIdLine`, `StagePublication`                             | `forge/forge.ts`                                                      | Publication                       |
| `Intent`, `DeclaredEffect`, `AttemptOwner`, `UnresolvedAttempt` | `cli-kernel/kernel-journal.ts`                                        | Attempt and Launch                |
| `Observation`, `LaunchObservation`, `StageObservation`          | three seams, overlapping shapes; `observeStartReply` answers a fourth | Attempt: one `Observation`        |
| `TerminalAddress`, `Terminal`, `SharedDocument`                 | `herdr-core/herdr-core-link.ts`                                       | not placed                        |
| `Secret`                                                        | `process/process.ts`                                                  | not placed                        |
| `SettingsView`, `SettingsDigest`                                | `settings/settings.ts`                                                | Provider route reads the view     |
| `RequestFacts`, `RequestAdmission`                              | `transport/transport.ts`                                              | Request admission, `admitRequest` |
| `PushRemote`                                                    | `git/git.ts`                                                          | Publication                       |

- `Transport.serve` takes `admitRequest` as a parameter until Request
  admission is built. Then the transport imports it and the parameter goes.
- A machine is a plain `string` in every seam. `MachineName` is not built.

## Words the glossary lacks

- The service over the kernel's journal, here `CliKernelJournal`.
- The service that makes a send permit, here `SendPermitMaker`.
- The error every unbuilt entry answers, here `NotBuilt`.
- The script a test layer is built with, here `<Seam>TestScript` and
  `layerTestWith`.
- The web app's side of the test transport, here `TransportTestWebApp`.
- What is typed into a terminal (text, keys or an interrupt), here `Typed`.
- Refusing a remote command's late copy after its lookup. module-map.md
  already lists it.
- A browser page connected to the transport, here `page` and `PageGone`.
- `Unobservable`, the observer's answer while a request may still be
  pending. launch-admission.md uses the word; the glossary does not.
- An effect that a closer may run again because a repeat changes nothing,
  here `keyedByAttemptId`. module-map.md lists the step; neither names the
  property.
- A request that was never sent, against one sent and not answered, here
  `not-sent` and `unanswered`. The glossary's Link lost covers both.
- A run that closes an attempt it does not own, here only the field `by`.
  The glossary's closure command is person-only, and launch-admission.md
  lets the tick close a Confirmed launch.
- An attempt owner that has stopped, here `attemptOwnerStopped` and
  `AttemptOwnerMayBeRunning`.
- A reply that is held back, here `withheldUntil` in the test link's script.
- Refuting evidence. launch-admission.md already lists it.
