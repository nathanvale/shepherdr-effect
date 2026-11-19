# Module map

Design candidate 1 with the grafts and corrections in
[synthesis.md](synthesis.md) and the decisions made since, in the words of
[GLOSSARY.md](../../GLOSSARY.md). Only the import schemas are built. A task
start with a crash at each step, each store's authority, and other machines
are in [module-map-crashes.md](module-map-crashes.md).

Changed since: see [the index](../agents/README.md).

Fork paths are relative to `/Users/nathanvale/code/herdr-projects` at
`9859c344`; `ht/` is `mods/tasks/bin/herdr_task/`.

## Layer rule

```
entries    -> procedures -> domain core
entries    -> adapters (only src/app/layers.ts, for their Layers)
procedures -> adapters (their Effect services) -> domain core
```

- **Entries**: `src/cli.ts`, `src/daemon.ts`, `src/commands.ts`,
  `src/command-result.ts`, `src/app/layers.ts`, every `<area>/handlers.ts`,
  and the web app.
- **Procedures** (`src/procedures/<area>/`) may require another procedure's
  Effect service (task and tick procedures require `LaunchAdmission`), never
  its internals, never in a cycle.
- **Domain core** (`src/domains/<area>/`) imports only stable Effect modules
  and other domain core folders, and does no input or output (rule F6 in
  [rename-plan.md](rename-plan.md)).
- **Adapters** (`src/adapters/<dependency>/`, and `src/state-files/` for the
  import) import only the domain core. Two named exceptions require another
  adapter's Effect service: remote machines require `HerdrCore`; the import
  requires `Store`.
- A folder exports through its `index.ts` only. Only `src/cli.ts` writes to
  process streams.

Enforcement: a local ESLint rule beside `no-domain-output` gives each file its
layer by path and refuses any other import, or one past `index.ts`, in
`bun run check`. Types hold the rest: the send permit, the merge permit,
`PersonCaller` and `PositiveEvidence` have no constructor outside their one
maker. `src/inventory/` sits outside the layers; nothing in them imports it.

## Entries

All shallow by design: each parses, wires or renders, and hands on.

| Module                                 | Owns                                                                                      | Interface        | Alone talks to | Replaces                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------- | -------------- | ----------------------------------------------------------------- |
| Command entry, `src/cli.ts`            | Parse, find the caller, run one command on the CLI kernel, print its result               | 1                | stdout, stderr | `ht/cli.py` dispatch, the CLI half of `bin/shepherdr`             |
| Daemon, `src/daemon.ts`                | Run one daemon role                                                                       | 1                | nothing        | `service/main.ts` as composition root, the `ht/scheduler.py` loop |
| Command table, `src/commands.ts`       | Every command: route, command identity, resend safety, agent-facing and person-only marks | 1 (`commands`)   | nothing        | the argument tree in `ht/cli.py`, the `service/actions.ts` switch |
| Command handlers, `<area>/handlers.ts` | One procedure call and its result per command                                             | 1 per command    | nothing        | command bodies in `ht/commands.py` and `service/actions.ts`       |
| Result, `src/command-result.ts`        | `CommandResult`, `Envelope`, `Outcome`, the exit code table, plain JSON output            | 2 renderers      | nothing        | `ht/output.py`                                                    |
| Layer graph, `src/app/layers.ts`       | `CommandLayer`, `SchedulerRoleLayer`, `ServiceRoleLayer`, `TestLayer`, `DAEMON_PASSES`    | 4 Layers, 1 list | nothing        | property wiring in `service/main.ts`, about 25 timers             |
| Web app (FoldKit, not yet proven)      | Screens and the terminal mount                                                            | its screens      | the transport  | `web/`                                                            |

## Procedures

Effect services with no outside system of their own.

| Module                                                        | Owns                                                                        | Interface                                                 | Hides                                                                                               | Depth                                   | Replaces                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Launch admission, `src/procedures/launch/`, `LaunchAdmission` | Every launch request, utility launches included; the only send permit maker | 4: `preflight`, `start`, `findUnresolved`, `closeAttempt` | intent, prepare step order, fresh launch revision, confirmation, the task assignment and its re-run | Deep: four calls over two stores        | `ht/launch_admission.py`, `ht/launch.py`, the send in `ht/revive.py`                 |
| Task procedures, `src/procedures/task/`, `TaskProcedures`     | Every task command, for the command entry and the transport alike           | about 24                                                  | finding the task list, placement, briefs, review rounds, completion                                 | Deep, wide by contract                  | `ht/commands.py`, `ht/queues.py`, `ht/proof.py`, `service/show.ts`                   |
| Tick procedures, `src/procedures/tick/`, `TickProcedures`     | One tick; the scheduler's own launch                                        | 2: `runTick`, `ensureScheduler`                           | pass order and isolation, the tick lock                                                             | Deep: two calls replace about 25 timers | `ht/tick.py`, `ht/scheduler.py`, `ht/news.py`, `ht/archive.py`, `service/jobs.ts`    |
| Publication procedures, `src/procedures/publication/`         | A Bitbucket publication on ready, one attempt per publication stage         | 1: `publish`                                              | the stage plan, pushes, the publication record                                                      | Deep                                    | the effects in `ht/publications.py`                                                  |
| Machine procedures, `src/procedures/machine/`                 | Remote commands, remote jobs, the reach map, health probes, machine holds   | 3: `relayCommand`, follow a remote job, refresh reach     | the remote install before a run, a late reply                                                       | Deep                                    | `ht/link.py`, remote parts of `ht/cli.py`, `service/machines.ts`, `service/reach.ts` |
| Live view, `src/procedures/live-view/`, `LiveView`            | The snapshot of tasks, terminals and spaces, and its stream of changes      | 2                                                         | merging store changes, herdr-core events and unresolved attempts                                    | Medium                                  | `service/live.ts`, `service/watch.ts`, `service/model.ts`                            |
| Space procedures, `src/procedures/space/`                     | Spaces, Assistants, tab agents, the Autopilot switch                        | about 6                                                   | the `shepherdr` shared document's layout                                                            | Medium                                  | `service/spaces.ts`, `service/store.ts`, `service/autopilot.ts`                      |
| Conversation procedures, `src/procedures/conversation/`       | Reading an agent's session, sending a message once, held messages           | about 4                                                   | session log tailing; each send is an attempt                                                        | Deep                                    | `service/chats.ts`, `service/send-once.ts`, `core/send.js`                           |

## Domain core

Pure: no input or output, so no outside system.

| Module                                              | Owns                                                                                                                       | Interface                                    | Hides                                                                            | Depth                              | Replaces                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Attempt, `src/domains/attempt/`                     | One attempt state machine for launches, publication stages, remote commands and message sends; evidence types              | 5, `confirm` and `findUnresolved` among them | how kernel records map to the five attempt states                                | Deep: uncertainty is modelled once | the states in `ht/launch_admission.py` and `ht/publications.py`                     |
| Launch, `src/domains/launch/`                       | `LaunchRequest`, launch identity, `TaskAssignment`, launch revision                                                        | 2: `launchRevisionOf`, `conflictKeyOf`       | key encoding (`#` is not a kernel key character), refusal words                  | Medium                             | the pure half of `ht/launch_admission.py`                                           |
| Task, `src/domains/task/`                           | Task lists, stored states and their transitions, `assignAgent`, `markDone`, `deriveTaskStatus`, holds, review rounds, news | about 20 transitions, 3 derivations          | task status rules, queue grace, task prefixes, `assignAgent` keyed by attempt id | Deep                               | the pure half of `ht/store.py`, `ht/reactions.py`, `core/tasks.js`, `core/needs.js` |
| Completion, `src/domains/completion/`               | Readiness, completion, cleanup, destination watch, `matchRepository`, `decideMerge`                                        | 4                                            | repository identity rules, merge policy                                          | Medium                             | decisions in `ht/forge.py` and `ht/github.py`                                       |
| Provider route, `src/domains/provider-route/`       | Launch plans, settings layers, selection revision, the Azure AI Foundry rule                                               | 3                                            | layer resolution, fingerprints, nonsecret environment                            | Deep                               | `ht/providers.py`, `ht/settings.py` rules, `core/settings.js`                       |
| Publication, `src/domains/publication/`             | Publication records and stages, `attemptIdLine`, push remote ownership                                                     | 3                                            | the create-if-absent push rule                                                   | Deep                               | the logic of `ht/publications.py`                                                   |
| Request admission, `src/domains/request-admission/` | `admitRequest`                                                                                                             | 1                                            | header, host and origin rules                                                    | Shallow but critical               | `service/auth.ts`                                                                   |
| Reach, `src/domains/reach/`                         | Reach map, machine holds, `electServingMachine`                                                                            | 4                                            | the hop walk, health limits                                                      | Medium                             | `ht/machine.py` holds, `core/machines.js`, `service/host.ts`                        |
| Automation, `src/domains/automation/`               | Automations, schedule rules, Autopilot                                                                                     | about 6                                      | time words, event matching                                                       | Medium                             | `ht/automations.py`, `ht/when.py`, `core/autopilot.js`                              |
| Caller, `src/domains/caller/`                       | `Caller` and its three kinds, `requirePerson`; also `Transition` in `src/domains/transition.ts`                            | 2                                            | nothing                                                                          | Shallow: vocabulary                | an allow-list today                                                                 |

## Adapters

One per outside dependency, each with a `layer` and a `layerTest`.

| Module                                                             | Owns, and alone talks to                   | Interface                                                             | Hides                                                                                                            | Depth                | Replaces                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| Store, `src/adapters/store/`, `Store`                              | This machine's SQLite file                 | 3: `transact`, read, changes                                          | write-ahead mode, full synchronisation, schema versions; unreadable refuses                                      | Deep                 | `ht/store.py`, the rename writers in `ht/tick.py`, `ht/news.py`, `ht/machines.py` |
| CLI kernel journal, `src/adapters/cli-kernel/`                     | The kernel's state add-on journal          | 4: begin, record an effect with its observer, unresolved cases, close | the kernel's state seam (being upgraded), attempt id to operation id                                             | Deep                 | the `.launches.json` and `.publications.json` writes                              |
| Settings, `src/adapters/settings/`, `Settings`                     | The settings file                          | 2: `readStrict`, write                                                | missing means Personal, the settings digest                                                                      | Medium               | `ht/settings.py` file access, `service/settings.ts`                               |
| herdr-core link, `src/adapters/herdr-core/`, `HerdrCore`           | herdr-core                                 | about 15; a terminal start takes a send permit                        | framing, reconnecting, events, shared documents, the real environment guard, `observeLaunch`                     | Deep                 | `service/hc/`, `service/hub.ts`, every `hc` call in `ht/base.py`                  |
| Remote machines, `src/adapters/remote-machines/`, `RemoteMachines` | Other machines' files, through `HerdrCore` | 5, `ensureInstalled` and `probeHealth` among them                     | platform, digests, the shim, the install marker, chunked writes                                                  | Deep                 | `ht/link.py` polling, `ht/machines.py` probes, `bin/sync-shared`                  |
| Forge, `src/adapters/forge/`, `GitHubForge`, `BitbucketForge`      | `gh` and GitHub; Bitbucket's REST API      | 3 and 3; no Bitbucket merge                                           | wire shapes, sign-in, finding a pull request by its attempt id line                                              | Medium               | `ht/github.py`, `ht/bitbucket.py`, `ht/bitbucket_http.py`                         |
| Git, `src/adapters/git/`                                           | `git`                                      | about 8                                                               | worktree adoption at its derived path                                                                            | Medium               | `service/worktree.ts`, `core/worktree.js`                                         |
| Process, `src/adapters/process/`                                   | Every other child process                  | 1                                                                     | timeouts; a secret only on standard input; refuses `hc`                                                          | Shallow: the bottom  | `run` in `ht/base.py`                                                             |
| Transport, `src/adapters/transport/`, `Transport`                  | The service role's port                    | 3: serve, publish, a terminal stream                                  | `admitRequest` before every handler, the Origin check before every upgrade, `drain` and `pause`, the daemon lock | Medium               | the router in `service/main.ts`, `service/lock.ts`, `service/terminal.ts`         |
| Tailnet, `src/adapters/tailnet/`, `Tailnet`                        | `tailscale`                                | 3                                                                     | `serve` on `/shepherdr`, never funnel; the tailnet owner                                                         | Medium               | `service/tailscale.ts`, `service/peer.ts`                                         |
| Model providers, `src/adapters/model-providers/`, `ModelProviders` | Model providers                            | grouped                                                               | secrets, streaming                                                                                               | Medium               | `service/model.ts`                                                                |
| Caller resolver, `src/adapters/caller/`, `CallerResolver`          | The calling terminal's labels              | 1                                                                     | label rules, whether a person is at the terminal                                                                 | Shallow but critical | nothing in code                                                                   |
| Import, `src/state-files/`, `importStateFiles`                     | The old install's state files, read once   | 1, and `state check`                                                  | import schemas, the state file registry, round trips                                                             | Deep                 | nothing at run time                                                               |
| Window, `src/adapters/window/`                                     | The window and its window mods             | later                                                                 | not designed                                                                                                     | later                | the window mods' calls                                                            |

The clock is Effect's own `Clock`, with `TestClock` in tests: no module.

## Invariants

Each invariant in [grounding.md](grounding.md), the one module that holds it,
and how.

| Invariant                                                             | Module                            | Type or mechanism                                                                                                                          |
| --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A launch's intent is recorded before any effect                       | Launch admission                  | The kernel flushes the intent before handler entry; the prepare step runs only inside the handler                                          |
| Attempt states                                                        | Attempt                           | Five tags, read from the kernel's records, never stored in the store                                                                       |
| One unresolved attempt per launch identity                            | Launch admission                  | `conflictKeyOf(launchIdentity)` is in the intent; the kernel's start admission refuses an overlapping unresolved case                      |
| At send, the intent is the caller's and the launch revision unchanged | Launch admission                  | Only the owner run appends its events; the launch revision is compared just before `effect-started`; the send permit is made only after it |
| Uncertain is never retried, never closed without positive evidence    | Attempt                           | Uncertain leaves only by `confirm(PositiveEvidence)` or `refute`; only adapters make evidence                                              |
| Written whole and synced; unreadable refuses, never empty             | CLI kernel journal, Store, Import | The kernel's framed records; SQLite with full synchronisation; the import refuses an unreadable state file                                 |
| No terminal starts outside launch admission                           | herdr-core link                   | A terminal start takes a `SendPermit`; the scheduler's terminal and remote jobs are utility launches                                       |
| A publication stage's intent is synced before its effect              | Publication procedures            | Each publication stage is its own kernel operation with its own attempt id                                                                 |
| An uncertain stage closes only on its attempt id                      | Publication                       | Its positive evidence is a pull request carrying its attempt id line, made only by `BitbucketForge`                                        |
| A repository identity mismatch refuses before any call                | Completion                        | Forge adapters accept only `MatchedRepository`, made only by `matchRepository`                                                             |
| Unknown GitHub checks never merge                                     | Completion                        | `decideMerge` makes a `MergePermit` only from a passed check observation                                                                   |
| A Bitbucket merge is never sent                                       | Forge                             | `BitbucketForge` has no merge                                                                                                              |
| Missing settings means Personal; unreadable refuses                   | Settings                          | `readStrict` returns a `SettingsView` or `SettingsUnreadable`                                                                              |
| Resume, stale selection, Azure AI Foundry on the settings owner       | Provider route                    | `planFromRecordedBinding`, the `SelectionRevision` compare, the `settingsOwner` check                                                      |
| Six stored states; the rest derived                                   | Task                              | `TaskState` has six literals and a store check; `TaskStatus` comes only from `deriveTaskStatus`                                            |
| The person marks Done, or the Assistant relays the person's request   | Task                              | `markDone` takes a `PersonCaller` or an Assistant relay, and records which; same user, so not a security boundary                          |
| One scheduler per machine, in `herdr-automations`                     | Tick procedures                   | A utility launch with launch identity `scheduler:<machine>`                                                                                |
| One tick at a time                                                    | Tick procedures                   | The tick lock is a store row naming its holder (was `flock`)                                                                               |
| Request admission                                                     | Request admission                 | The transport runs `admitRequest` before every handler and the Origin check before every upgrade                                           |
| One service role per machine                                          | Transport                         | The daemon lock, scoped in `ServiceRoleLayer`                                                                                              |
| The newest serving machine record wins                                | Reach                             | `electServingMachine` over the `shepherdr.host` shared document                                                                            |
| Secrets travel by standard input only                                 | Process                           | `Secret` is not a string; only standard input takes it                                                                                     |
| Only the real environment                                             | herdr-core link                   | `RealEnvironmentRefused` at layer build; `Process` refuses `hc`                                                                            |
| A confirmed task launch puts its agent on its task once               | Launch admission                  | The task assignment is a second declared effect; `assignAgent` is keyed by attempt id                                                      |

## What exists in `src/` today

- `src/cli.ts`: the command entry, building the envelope by hand until the
  kernel.
- `src/commands.ts`: the command table, with `state check`,
  `inventory extract` and `inventory check`; the design's commands join it.
- `src/commands-contract.ts`: the command definition; its result types move to
  `src/command-result.ts` or the kernel's.
- `src/state-files/`: the import's schemas, registry and round trip, and the
  `state check` handler; `importStateFiles` joins it.
- `src/inventory/`: design tooling, not product; outside the layers.

## Open questions for the person

From [synthesis.md](synthesis.md):

1. **The daemon on the kernel.** The kernel allows one transaction per process
   ([kernel-uplift.md](kernel-uplift.md), item 7). Should the tick and service
   role wait for that, or run the command entry per launch until then?
2. **Agents and the daemon.** Decided by Nathan on 2026-11-19: yes, always.
   An agent's command never depends on the daemon.
3. **A dead attempt owner.** May an Intended attempt close as not applied
   without you? The kernel cannot yet prove an attempt owner stopped (item 1).
4. **Done and the Assistant.** Decided by Nathan on 2026-11-19: the Assistant
   may mark a task Done only when the person asks, never on its own
   judgement. The task records that the Assistant relayed the request.
5. **Other machines.** Bun with one bundle, or a compiled binary per platform?

New:

6. **Unresolved attempts at the cutover.** Should the import make each a
   kernel operation left for you to close, or refuse while any remain?
7. **Refuted under the kernel.** The kernel records `not-applied` itself only
   when no effect started. When herdr-core's reply proves nothing reached it,
   may the run close its own attempt, or must you run `launch recover`?
8. **Publication stages.** A repeated `herdr-task ready` closes an uncertain
   stage on positive evidence today. Keep that, or make it person-only?
9. **The window's files.** Window mods read `service.json` and the local
   token. Should the transport keep writing both?
10. **The install marker.** It sits under the tasks folder, which the cutover
    retires. Should it become a store row?

## Words the glossary lacks

- The adapter over the kernel's state add-on (here
  `src/adapters/cli-kernel/`).
- Folders for the machine, space and conversation procedures, the git and
  child process adapters, and the web app.
- Domain folders for forge decisions (here in `src/domains/completion/`) and
  the serving machine election (here in `src/domains/reach/`).
- The step that re-runs a task assignment before a closure. "Repair" is the
  template's word, and the glossary avoids it for a closure.
- Fencing: refusing a remote command's late copy after its lookup.
- The tick lock as a store row; the glossary gives only `.tick.lock`.
- The old service's asks (question cards), voice, push notifications,
  artifacts and browser, not designed here.
