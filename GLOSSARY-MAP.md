# Glossary map

Each word has one owner. Find the glossary that owns the word you need, and
use its word with its owner's meaning. This repository's
[GLOSSARY.md](GLOSSARY.md) also says how a word owned elsewhere is named in
code here; it never changes that word's meaning.

| Glossary        | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Where                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This repository | Every word [GLOSSARY.md](GLOSSARY.md) defines: tasks, launches and attempts, publication stages, provider routes and settings, machines, the store and the import, the herdr-core link, transport and web, the command line, and the design words this repository adds (domain core, procedure, permit and others)                                                                                                                                                                                                                                                                                            | [GLOSSARY.md](GLOSSARY.md)                                                                                                                                                                                                                                                                                                                                             |
| CLI kernel      | Command Contract 3 words, used exactly as the kernel defines them: operation and operation id, intent, effect, closure and its dispositions (completed, not-applied, outcome-unknown), observer and observation, conflict key, unresolved case, unfinished report, coordination lock, owner lease, start admission, handler entry, dispatch, outcome, result, envelope, station, cause code, failure class, exit code, handoff and handback, next action, repair action, transaction state, effect class, command identity, route, run id, approval store, run binding, "Possible results" and "If no result" | The kernel repository, `https://github.com/nathanvale/agent-cli-kernel`: its state add-on design `kernel/src/addons/state/DESIGN.md` and its term table `tests/template/glossary/term-table.json`, read at `4be9a377`. The kernel's own map names the Agent ecosystem glossary as the source of those names, and its `docs/agents/cli-kernel.md` cites the frozen text |
| Template        | The words of the template this repository was generated from that are in use here: check command, gate, names check, refusal, repair, recorded hit, verdict, toolchain, doctor and test surface                                                                                                                                                                                                                                                                                                                                                                                                               | `GLOSSARY.md` on the template's main: `https://github.com/nathanvale/bun-typescript-template/blob/main/GLOSSARY.md`                                                                                                                                                                                                                                                    |
| Old Shepherdr   | The words carried over unchanged, listed below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `GLOSSARY.md` of the old system at `9859c344`: `https://github.com/nathanvale/herdr-projects/blob/9859c3447a5b57e781310f254f0b1776ec4f1b25/GLOSSARY.md`                                                                                                                                                                                                                |
| Agent ecosystem | Words shared across projects that no repository glossary defines yet, Kernel, Bootstrap, Repository profile, Template provenance and Template upgrade among them. Private, so only its name and owner here                                                                                                                                                                                                                                                                                                                                                                                                    | "Agent ecosystem glossary (living)" in Linear. Owner: Engineering, through Linear MAG-64                                                                                                                                                                                                                                                                               |
| Design words    | Module, Interface, Implementation, Depth, Seam, Adapter, Leverage and Locality                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The codebase-design skill, under "Glossary" in its `SKILL.md`. The skill is not in this repository                                                                                                                                                                                                                                                                     |

Use **CLI kernel** in contributor guidance. Use **Command Contract 3** when
citing the frozen specification the kernel implements.

## Words carried over from the old Shepherdr glossary

These keep the old glossary's meaning and spelling. Their names in code are in
[GLOSSARY.md](GLOSSARY.md), under "Names in code for words owned elsewhere".

- Forge work: Forge, Forge adapter, Repository identity, Pull request
  identity, Candidate, Source branch, Destination, Publication, Uncertain
  publication.
- Review and integration: Readiness, Check observation, Approval evidence,
  Integration, External merge evidence.
- Task completion: Task, Dependency, Hold, Base synchronization, Completion,
  Cleanup, Cleanup pending, Cleanup held, Cleanup complete, Resource
  ownership, Conversation.
- Authentication and execution: Execution host, Application host,
  Host-managed authentication, Secret vault, Agent grant, Regular repository,
  Contained repository, Checked repository broker.

No word of the old glossary is retired. The retired words below come from the
old system's code and documents, from the three design candidates, and from
the template's starter.

## One word, several owners

Where two owners use the same word, each keeps it only with its qualifier.

| Word        | Its owner's meaning                                      | The qualified word for the other meaning                  |
| ----------- | -------------------------------------------------------- | --------------------------------------------------------- |
| operation   | CLI kernel: one command run's journaled transaction      | attempt (one effect's try); procedure (an Effect service) |
| route       | CLI kernel: a command's words                            | provider route; push remote                               |
| binding     | CLI kernel: run binding                                  | recorded binding                                          |
| admission   | CLI kernel: start admission, admission lock              | launch admission; request admission                       |
| transaction | CLI kernel: the transaction a command run records        | store transaction                                         |
| journal     | CLI kernel: the state add-on's journal                   | store; the launches file and publications file (import)   |
| effect      | CLI kernel: one declared outside change                  | Effect (the TypeScript library) is written capitalised    |
| inventory   | CLI kernel: the effects inventory of a result            | interface inventory                                       |
| candidate   | Old Shepherdr: the exact task commit proposed for review | design candidate                                          |
| hold        | Old Shepherdr: a condition that stops a task action      | held message; machine hold                                |
| observation | CLI kernel: an observer's report on one effect           | check observation (old Shepherdr's, about forge checks)   |
| verdict     | Template: the result of judging one thing once           | round-trip verdict (`Verdict` in `round-trip.ts`)         |
| stamp       | Template: copying stamped source                         | install marker                                            |

## Retired words

A retired word is not used for its old meaning in any new name. It may still
appear as a wire name (an on-disk key or literal, a terminal label, a command
route) in the import schemas under `src/state-files/` and in adapters.
[docs/design/rename-plan.md](docs/design/rename-plan.md) lists the names in
this repository that still carry one.

| Retired word                                  | Came from                      | Use instead                              | Owner of the replacement |
| --------------------------------------------- | ------------------------------ | ---------------------------------------- | ------------------------ |
| claim (a launch's), Claimed                   | Old system, design candidates  | intent; the attempt state Intended       | CLI kernel; this repo    |
| claim (a publication's)                       | Old system                     | publication record                       | This repository          |
| never-submitted                               | Old system                     | Intended                                 | This repository          |
| submission-uncertain, Sending                 | Old system, design candidate 3 | Uncertain                                | This repository          |
| reconcile, recover (as concepts)              | Old system                     | closure command; closure                 | This repo; CLI kernel    |
| settle, settlement                            | Design candidate 1, old system | confirm (the attempt's own run); closure | This repo; CLI kernel    |
| held (a launch)                               | Old system                     | unresolved attempt                       | This repository          |
| put on, TaskJob, attachAgent                  | Old system, design candidate 1 | task assignment, `assignAgent`           | This repository          |
| store, Store (the old tasks folder and class) | Old system                     | tasks folder; task list                  | This repository          |
| StateFiles, state files (for new storage)     | Design candidate 1             | store                                    | This repository          |
| journal (for `.launches.json` and the like)   | Old system, this repository    | launches file, publications file         | This repository          |
| revision (unqualified)                        | Old system                     | launch revision; selection revision      | This repository          |
| route (for a model route), Route              | Old system, design candidates  | provider route                           | This repository          |
| provider (for a forge)                        | Old system                     | forge kind                               | This repository          |
| ProviderBinding                               | This repository                | recorded binding                         | This repository          |
| coordinator (outside wire names)              | Old system                     | Assistant                                | This repository          |
| Address                                       | Design candidates              | terminal address                         | This repository          |
| operation id, OpId, Herdr-Operation id        | Old system, design candidate 3 | attempt id                               | This repository          |
| operations, Ops (Effect services)             | Design candidate 1             | procedure                                | This repository          |
| Api, `adapters/http`                          | Design candidate 1             | transport                                | This repository          |
| gate (for an HTTP request)                    | Old system                     | request admission                        | This repository          |
| Actor                                         | Design candidate 3             | caller                                   | This repository          |
| Reply, Failure (for a command's answer)       | Design candidate 2             | result, envelope                         | CLI kernel               |
| OperationResult                               | Template starter               | `CommandResult` for the kernel's result  | CLI kernel               |
| ForgeId, BoundForge, bindForge                | Design candidate 1             | repository identity; matched repository  | Old Shepherdr; this repo |
| MergeAdmitted                                 | Design candidate 1             | merge permit                             | This repository          |
| ChecksVerdict                                 | Design candidate 1             | check observation                        | Old Shepherdr            |
| RunWords, TerminalRunner                      | Design candidate 1             | send permit; herdr-core link             | This repository          |
| DaemonJob                                     | Design candidate 1             | pass                                     | This repository          |
| electHost, HostRecord                         | Design candidate 1             | serving machine                          | This repository          |
| Lossless                                      | Design candidate 1             | nothing: the clean cutover removed it    | None                     |
| fork (a conversation's)                       | Old system                     | conversation fork                        | This repository          |
| fork (the old system's source)                | This repository                | fork checkout                            | This repository          |
| takeover                                      | Old system                     | backup                                   | This repository          |
| main watch                                    | Old system                     | destination watch                        | This repository          |
| round (the scheduler's)                       | Old system                     | tick                                     | This repository          |
| made (what a start set up)                    | Old system                     | placement                                | This repository          |
| prompt (outside the import schemas)           | Old system                     | brief                                    | This repository          |
| `example.` (command identity prefix)          | Template starter               | `shepherdr.`                             | This repository          |

## A word not found anywhere

A word that no glossary above defines is not a term yet. Before you name a
file, folder, type, function, variable or test with it:

1. Search [GLOSSARY.md](GLOSSARY.md), this map's owners and the retired words.
   Use the defined word if one means what you mean, even if yours reads
   better.
2. If the concept belongs to this repository, add it to
   [GLOSSARY.md](GLOSSARY.md), with its meaning, the words to avoid and its
   name in code, in the same change that first uses it.
3. If it belongs to another owner (a Command Contract 3 concept, a word shared
   across projects), use the nearest word that owner defines and record the
   missing word for that owner: Linear MAG-98 for the CLI kernel, Linear
   MAG-64 for the Agent ecosystem glossary. Do not define it here.
4. Never coin a synonym for a word that is already defined, and never reuse a
   retired word for a new meaning.
