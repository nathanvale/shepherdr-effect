# Completion: one module from Ready to cleanup

What the architecture review of 19 November 2026 decided for everything that
happens to a task after `herdr-task ready`. Nothing here is built. Words follow
[GLOSSARY.md](../../GLOSSARY.md). This note changes
[module-map.md](module-map.md); the changes are listed under "What moves in the
module map".

Each decision says who made it. "Nathan" means he chose it on 19 November
2026. "Default" means the review applied it and he can change it; the
alternatives are under "Defaults Nathan can change".

## Why one module

- In the old system the three files that change together most are
  `commands.py`, `tick.py` and `github.py` (18, 15 and 14 shared commits since
  4 November 2026). They are the command half, the tick half and the forge
  half of this one concept.
- The old `forge.py` already gives commands, the tick and the Accept card one
  interface to a task's pull request. The module map takes it apart: the choice
  of forge kind lands in Task procedures, Tick procedures and Publication
  procedures.
- A new forge would edit five planned modules. With one module and one forge
  seam it edits two.

## The goal it serves

Nathan wants two ways to run, and one report.

- **Unattended.** Work merges by itself overnight.
- **Approved.** The person approves each merge.
- **A morning report** that lists everything that merged, each with its proof
  artifact, for the person to review.

The two ways to run are the existing merge policy (`tasks.merge`): `ask`,
`checks` or `auto`, set for one task or at any settings layer.

## What Completion owns

| Decision                                                                                                                                                                                                       | By      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| It starts at the `ready` command. Publishing, the stored state `ready` and the merge policy are one step, so "Ready means published" has one owner. The review round rules stay pure in Task.                  | Nathan  |
| It owns all five endings of a Ready task (below).                                                                                                                                                              | Nathan  |
| The tick makes one call for each Ready task. That call reads the forge and moves the task to whichever ending applies. `accept`, `merge` and `adopt` record the person's decision and then make the same call. | Default |
| It marks a task Done once its integration is confirmed, and the task records why: the person's approval, the merge policy, or a merge made outside Shepherdr.                                                  | Default |
| It keeps an integration record at the moment of each merge.                                                                                                                                                    | Nathan  |
| Its cleanup decides when everything a Done task left behind is removed.                                                                                                                                        | Nathan  |

The five endings:

1. Shepherdr merges the pull request on GitHub.
2. GitHub's merge queue merges it.
3. The person merges it on Bitbucket, and the tick finishes the task.
4. The folder has no forge, so the task's agent merges locally.
5. There is nothing to merge, so the person accepts the task.

## What an automatic merge needs

Decided by Nathan. A merge with no person present needs both of these:

- **A proof artifact** that the repository's verification skill captured. A
  page the worker wrote does not count.
- **One verification that is not the agent's own word:** a passed check
  observation, or a review round where the repository has no checks.

A review round counts only when the Reviewer records its own result, on the
exact candidate commit. In the old system the worker starts its reviewer and
records the round itself.

A task that lacks either one waits for the person's approval and appears in
the morning report.

The old system already refuses an automatic merge when checks fail, still
run, never started or cannot be read, when GitHub asks for an approval, when
the pull request was adopted, and on Bitbucket. Those rules stay.

## Publishing

- **Every forge kind publishes in stages, and each stage is an attempt**
  (default). GitHub has two stages (push, open). Bitbucket has three (push,
  draft, ready). A forge adapter supplies each stage's effect and how to
  observe it. Completion runs the stages.
- Each stage reads what exists before it acts, so a repeated stage finds
  nothing left to do.
- **An Uncertain stage may be closed by the next call** (default), only as
  completed, and only on positive evidence for that stage:
  - a pull request stage (open, draft, ready): exactly one pull request that
    carries the stage's attempt id line;
  - a push: the remote branch points at exactly the candidate commit the
    stage pushed. A push carries no attempt id line, so this is its only
    evidence.
- A remote branch at any other commit, or a missing one after a push whose
  reply was lost, is not evidence either way. That stage stays Uncertain for
  the person. Closing any stage as not applied stays person-only. The
  morning report lists every stage closed by the next call.
- **A Bitbucket merge is never sent** (default: the rule stays). Unattended,
  a Bitbucket task stops at a prepared pull request.

Costs to know:

- Each stage is its own kernel run, so a GitHub `ready` makes two more kernel
  runs than a plain command.
- A lost GitHub reply leaves an Uncertain stage. The old system adopts the
  open pull request for the branch without a record.
- The kernel closes a stage only when it can show that the run that sent it
  has stopped. Its first qualification row is Linux in a container.

## The integration record and the morning report

Completion writes one record for each merge, in both ways of running: the
candidate commit, the merge commit, the check observation as read then, the
proof artifact, and which rule merged it. The record is a row in the store
and is never pruned.

The morning report reads those records since a time. It also lists what did
not merge and why, and every stage closed without the person.

## Cleanup

- Cleanup removes the worktree and the branch once the merge is confirmed.
  No evidence lives in the worktree.
- Cleanup decides when each thing a Done task left behind is removed: the
  worktree, the branch, the terminals, the browser session and old versions
  of its artifacts. Each owner still removes its own files when cleanup asks.
- Proof artifacts stay on the machine and are read through the web app over
  the tailnet. They are not published outside.
- The pull request's description gains the text evidence (checks, commits,
  files changed), so the forge keeps a lasting copy of everything but the
  pictures.

The old system has nine separate cleanup rules and none for artifacts, which
keep their last 20 versions until someone removes them by hand.

## The forge seam

One interface for reading and publishing, satisfied by a GitHub adapter, a
Bitbucket adapter and an in-memory adapter for tests. Three adapters make the
seam real.

Merging is a separate ability that only some forge kinds supply. A merge
permit can be made only for a forge kind that has it, so "a Bitbucket merge is
never sent" is still held by a type.

Git stays its own adapter. Tests use real git in a temporary repository.

## What moves in the module map

| Planned module                                           | Change                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Completion, `src/domains/completion/`                    | Stays as the pure decisions, inside the new module.                              |
| New: Completion procedures, `src/procedures/completion/` | The module's interface: the commands' decisions, the tick's call, and two reads. |
| Publication procedures and Publication (domain core)     | Fold into Completion. A publication stage is no longer Bitbucket's alone.        |
| Task procedures                                          | Loses `ready`, `merge`, `accept` and `adopt`, and the action `evidence`.         |
| Tick procedures                                          | Calls Completion once for each Ready task. It reads no forge itself.             |
| Forge, `src/adapters/forge/`                             | One seam with three adapters, in place of two modules with different interfaces. |
| Task, `markDone`                                         | Also takes confirmed integration from Completion, and records it.                |

Every entry in `inventory/*.json` still maps to exactly one module.

## Tests that carry over

The old system's `test/test_forge.py`, `test/test_bitbucket.py`,
`test/test_bitbucket_publication.py` and `test/test_native_publication.py`
describe this module's behaviour. Port their cases to Completion's interface,
with scripted forge adapters and real git in a temporary repository. Tests on
the folded-in modules are not written.

## Defaults Nathan can change

| Default                                                         | The alternative                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Completion marks a merged task Done                             | A merged task waits for the person. Then every unattended merge stalls the tasks queued behind it. |
| The tick makes one call for each Ready task                     | Tick procedures keeps the order of reading, waiting, merging and finishing.                        |
| Every forge kind publishes in stages                            | Only Bitbucket has stages. GitHub keeps adopting the open pull request without a record.           |
| The next call may close an Uncertain stage on positive evidence | Only the person closes it. Then one slow reply stops that task until the person returns.           |
| A Bitbucket merge is never sent                                 | The unattended way of running may merge on Bitbucket. This changes an invariant in grounding.      |
| A repository with no verification skill never merges unattended | A proof artifact the worker wrote counts until the repository has a verification skill.            |

## Still open

- How long proof artifacts are kept.
- The screen for the morning report.
- The artifacts area, which the module map lists as not designed. The report
  depends on it.
- Whether the Reviewer must run on a different model from the worker. Today
  that is a setting.

## Glossary changes this needs

- **Done** gains a third source: confirmed integration.
- **Publication stage** applies to every forge kind.
- **Merge permit** names both makers: the person's approval, and the
  conditions for an automatic merge.
- New words, not yet defined: integration record, morning report, reviewed
  (the person has read a morning report), verification skill.
