# Adapter seams: what is assumed and what is open

The second half of [adapter-seams.md](adapter-seams.md). Words follow
[GLOSSARY.md](../../GLOSSARY.md).

## What the CLI kernel journal assumes about the kernel

`CliKernelJournal` was written from [kernel-uplift.md](kernel-uplift.md) and
[launch-admission.md](launch-admission.md) alone. The kernel's code was not
read. Each line is something the interface needs the kernel to do, or to let
Shepherdr do. The number is the item in kernel-uplift.md, where one applies.

1. An intent can carry Shepherdr's own attempt id, and an attempt is found
   again by it. The kernel's operation id never crosses the seam (item 2).
2. The caller names the attempt owner in the intent: machine, process id and
   process start time.
3. An intent declares its effects by name, and its facts are JSON.
4. A conflict key is a string the kernel accepts. Encoding a launch identity
   into one is Launch's work, not the seam's.
5. `begin` refuses a conflict key that an unresolved attempt holds, in the
   same step that records the intent, and the intent is flushed before
   `begin` returns.
6. `begin` can be called many times in one process (item 7).
7. `record` flushes `effect-started` before the effect is called.
8. The effect is an Effect program. Interrupting `record` interrupts it and
   leaves the effect Uncertain (item 9, and "every effect stops at the
   handler's deadline").
9. The observer runs once, after the effect, in the same run. Positive
   evidence is flushed as `effect-confirmed` and refuting evidence as
   `effect-unconfirmed`. No evidence, or `Unobservable`, flushes nothing.
10. Only the run that began an attempt calls `record` for it. A later run
    uses `close`.
11. The kernel records completion by itself once every declared effect is
    confirmed.
12. `close` offers `completed` and `not-applied`. It does not offer the
    kernel's `outcome-unknown`, so an Uncertain effect cannot be closed
    without positive evidence.
13. Closing as `completed` accepts the closer's positive evidence for an
    effect its owner never started. The tick's re-run of a task assignment
    depends on this.
14. Closing as `not-applied` is accepted when every declared effect is
    Intended or Refuted. Who may do it after a refuting reply is open
    question 7.
15. The kernel alone proves that an attempt owner has stopped (item 1). The
    seam has no entry and no error for it yet.
16. `unresolved` reads every unresolved attempt, or those of one conflict key
    (item 3).
17. Opening the herdr-core link outside every `record` call is the caller's
    rule. The seam cannot check it.

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

| Type                                                   | Where it is now                 | Its maker, once built             |
| ------------------------------------------------------ | ------------------------------- | --------------------------------- |
| `MatchedRepository`, `MergePermit`, `CheckObservation` | `forge/forge.ts`                | `matchRepository`, `decideMerge`  |
| `attemptIdLine`, `StagePublication`                    | `forge/forge.ts`                | Publication                       |
| `Intent`, `AttemptOwner`, `UnresolvedAttempt`          | `cli-kernel/kernel-journal.ts`  | Attempt and Launch                |
| `Observation`, `LaunchObservation`, `StageObservation` | three seams, overlapping shapes | Attempt: one `Observation`        |
| `TerminalAddress`, `Terminal`, `SharedDocument`        | `herdr-core/herdr-core-link.ts` | not placed                        |
| `Secret`                                               | `process/process.ts`            | not placed                        |
| `SettingsView`, `SettingsDigest`                       | `settings/settings.ts`          | Provider route reads the view     |
| `RequestFacts`, `RequestAdmission`                     | `transport/transport.ts`        | Request admission, `admitRequest` |
| `PushRemote`                                           | `git/git.ts`                    | Publication                       |

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
