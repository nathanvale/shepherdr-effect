# Shepherdr on Effect glossary

The words this repository owns: Shepherdr (a tool that runs coding agents as
tasks in herdr-core terminals) redesigned in TypeScript on Effect v4, with a
SQLite store and the CLI kernel at its command line. No other glossary defines
these words. [GLOSSARY-MAP.md](GLOSSARY-MAP.md) names the owner of every other
word this repository uses, and the words it has retired.

## How to read an entry

Each entry gives one meaning, the words to avoid for it, and its name in code.

- An `_Avoid_` line lists words not to use for its term. A note in parentheses
  says when: it covers the words before it, back to the previous note or
  semicolon. A word with no note after it must never appear in a file or
  folder name. A word noted `(unqualified)` must not stand alone as a name;
  pair it with the word that says which one is meant.
- A `_Code_` line gives the folder, the file stem, the type name and the
  function or variable prefix that carry the term. Folders that do not exist
  yet are where the term goes when it is built. Wire names (on-disk keys,
  terminal labels, JSON fields, command routes) keep their external spelling
  and are not governed by this line.
- Words in `code` inside a definition are wire names or file names, quoted
  exactly.

## Language

### Tasks

**Task list**:
One folder's tasks, with the list's slug, prefix and next task number.
_Avoid_: store (for a task list), board, project (unqualified)
_Code_: folder `src/domains/task/`; file `task-list`; type `TaskList`; prefix `taskList`.

**Tasks folder**:
The old install's folder that holds every task list and the engine's dot files
(`~/.local/share/shepherdr/tasks`, or `HERDR_TASK_STORE`).
_Avoid_: store, STORE (for this folder)
_Code_: constant `TASKS` in `src/state-files/` and its tests only.

**Folder**:
The repository or plain directory a task list belongs to; its kind is `repo`
or `folder`.
_Avoid_: project (unqualified), workspace, repo (for a plain directory)
_Code_: field `folder` (an absolute path); type `FolderKind`.

**List slug**:
The file-safe name of a task list, unique on one machine.
_Avoid_: slug (unqualified), list id
_Code_: type `ListSlug`; prefix `listSlug`.

**Task prefix**:
The short letters a task list puts before its task numbers, such as `HAT`.
_Avoid_: project key, team key
_Code_: type `TaskPrefix`; prefix `taskPrefix`.

**Task number**:
A task's number within its task list, given in order and never reused.
_Avoid_: task id, id (unqualified)
_Code_: type `TaskNumber`; prefix `taskNumber`. On disk it is `id`.

**Task key**:
`<list slug>#<task number>`, which names one task on one machine and is the
value of the `herdr.task` label.
_Avoid_: task id, task name
_Code_: type `TaskKey`; prefix `taskKey`.

**Task reference**:
What a person or an agent types to name a task: `HAT-4`, `4`, `#4` or
`<list slug>#4`. It is parsed once, where it enters.
_Avoid_: ref (unqualified), handle
_Code_: type `TaskRef`; function `parseTaskRef`; prefix `taskRef`.

**Stored state**:
One of the six states a task list records for a task: `todo`, `scheduled`,
`queued`, `running`, `ready` and `done`.
_Avoid_: status (for a stored state), phase, stage (for a task)
_Code_: type `TaskState`; prefix `taskState`.

**Task status**:
What the person sees for a task, derived from its stored state, its agents'
live state and its unresolved launch, and never stored.
_Avoid_: state (for a task status), column
_Code_: type `TaskStatus`; function `deriveTaskStatus`.

**Needs you**:
The task status of a task whose agent is waiting on the person.
_Avoid_: blocked, waiting (for this status)
_Code_: status literal `needs`.

**Done**:
The stored state that ends a task's work. It has three sources: the person
marks a task Done, the Assistant does when the person asks, or Completion
does once the task's integration is confirmed. The task records which, and
for integration, why.
_Avoid_: complete, finished, closed (for a task)
_Code_: function `markDone`, which takes a person caller, the Assistant's
relay of the person's request, or confirmed integration from Completion.

**Brief**:
The words a task's agent starts from.
_Avoid_: prompt (outside the import schemas), description (for a brief)
_Code_: prefix `brief`. On disk it is `prompt`.

**Placement**:
Where a task's work happens: its space, mode, worktree, branch, destination
branch and start commit.
_Avoid_: workspace, made (outside the import schemas)
_Code_: type `TaskPlacement`; function `recordPlacement`.

**Mode**:
Whether a task works in its folder itself (`here`) or in a worktree of its own
(`worktree`).
_Avoid_: kind (for a mode)
_Code_: type `TaskMode`.

**Agent row**:
One agent's record on a task: its terminal address, agent CLI, launch id,
session and log.
_Avoid_: TaskAgent, agent (for the record)
_Code_: type `AgentRow`; prefix `agentRow`. On disk it is an entry of `agents`
or `reviewers`.

**Task assignment**:
What a task launch carries so that its confirmed agent can be put on its task:
the task, the role and the agent row to write.
_Avoid_: TaskJob, job (for an assignment), attach (herdr-core's word for watching a terminal), put on
_Code_: type `TaskAssignment`; function `assignAgent`. On disk it is the
launch record's `task`.

**Queued start**:
What a queued or scheduled task will run when it starts.
_Avoid_: queue plan, QueuePlan
_Code_: type `QueuedStart`.

**Review round**:
One reviewer's pass over a task, ending in a report, a pass or a request for
changes.
_Avoid_: review cycle, iteration
_Code_: type `ReviewRound`; prefix `reviewRound`.

**Automation**:
A definition in a task list that adds a task on a schedule or when a task
event happens.
_Avoid_: cron, recurring task
_Code_: folder `src/domains/automation/`; type `Automation`.

**Schedule rule**:
A time rule read from words: once at a time, every so many minutes within
hours, or at set times on set days.
_Avoid_: cron, when (for a rule)
_Code_: type `ScheduleRule`.

**Autopilot**:
A space's switch that wakes its Assistant on a schedule rule or on task events.
_Avoid_: auto mode
_Code_: folder `src/domains/automation/`; type `Autopilot`.

**News**:
Task status changes told to the Assistant of the task's space.
_Avoid_: notification (unqualified), event (for news)
_Code_: type `News`; function `newsPass`.

**Held message**:
A message kept back while the person is typing to that agent, and sent later.
_Avoid_: hold (for a message), queued message
_Code_: type `HeldMessage`.

**Feedback problem**:
A problem in Shepherdr itself that an agent reported, with its filing state.
_Avoid_: bug report, issue (unqualified)
_Code_: type `FeedbackProblem`.

**Archive**:
Moving a done task out of the task list's working view after the settings'
`archive_after` days, keeping its record.
_Avoid_: delete, purge (for an archive)
_Code_: function `archiveTask`.

### Launches and attempts

**Attempt**:
One try at one effect whose result can be lost, such as starting a terminal,
pushing a branch or sending a command to another machine. Its states are
Intended, Uncertain, Confirmed, Refuted and Cancelled, and it is never retried.
_Avoid_: operation (the kernel's command run), submission, try (for an attempt), OpId
_Code_: folder `src/domains/attempt/`; file `attempt`; type `Attempt`; prefix
`attempt`.

**Intended**:
The attempt state after its intent is recorded and before its effect starts.
_Avoid_: claimed, never-submitted (outside the import schemas), pending (for an attempt)
_Code_: tag `Intended`.

**Uncertain**:
The attempt state after its effect started and before positive evidence
confirms or refutes it. Nothing retries or cancels an uncertain attempt.
_Avoid_: sending, submission-uncertain (outside the import schemas), in flight
_Code_: tag `Uncertain`.

**Confirmed**:
The attempt state reached on positive evidence that the effect happened.
_Avoid_: succeeded, settled, settle
_Code_: tag `Confirmed`; transition `confirm`.

**Refuted**:
The attempt state reached on evidence that the effect did not happen, such as
a reply proving nothing reached herdr-core.
_Avoid_: failed (for an attempt), not sent (as a state)
_Code_: tag `Refuted`; transition `refute`.

**Cancelled**:
The attempt state of an intended attempt whose effect never started.
_Avoid_: released, revoked (for the state)
_Code_: tag `Cancelled`; transition `cancel`.

**Unresolved attempt**:
An attempt that is Intended or Uncertain. While it is unresolved, no other
attempt with the same launch identity may begin.
_Avoid_: open, held, stuck, busy (for an attempt)
_Code_: type `UnresolvedAttempt`; function `findUnresolved`.

**Attempt id**:
The id an attempt carries into the outside world so that an observer can find
it: the `herdr.launch` label, the `Herdr-Operation` line of a pull request, a
remote command's `--op`.
_Avoid_: operation id (for ours), op id, request id
_Code_: type `AttemptId`; prefix `attemptId`.

**Attempt owner**:
The process that recorded an attempt's intent, named by machine, process id
and process start time.
_Avoid_: owner (unqualified), holder
_Code_: type `AttemptOwner`.

**Launch**:
An attempt that starts an agent or a utility terminal in a herdr-core terminal,
or types an agent back into its own kept terminal.
_Avoid_: start (as a noun for the record), spawn, run (for a launch)
_Code_: folder `src/domains/launch/`; file `launch`; type `Launch`; prefix
`launch`.

**Launch id**:
The attempt id of a launch, a version 4 UUID. It is the value of the
`herdr.launch` label.
_Avoid_: run id (the kernel's), terminal id
_Code_: type `LaunchId`; prefix `launchId`.

**Launch identity**:
What a launch starts, as one string: `task:<task key>[/reviewer]`,
`coordinator:<machine>/<space>`, `agent:<machine>/<space>/<slot>`,
`scheduler:<machine>` or `job:<machine>/<job id>`. At most one unresolved
attempt exists for each.
_Avoid_: identity (unqualified), launch key
_Code_: type `LaunchIdentity`; prefix `launchIdentity`.

**Launch request**:
What a caller asks launch admission to start: a task launch, an Assistant
launch, a revival or a utility launch.
_Avoid_: start request
_Code_: type `LaunchRequest` with tags `TaskLaunch`, `AssistantLaunch`,
`Revival` and `UtilityLaunch`.

**Utility launch**:
A launch of a terminal that runs no agent: the scheduler's terminal or a
remote job.
_Avoid_: helper start, side launch
_Code_: tag `UtilityLaunch`.

**Launch admission**:
The one module that admits every launch on a machine: preflight, intent,
prepare step, fresh revision check, send, confirmation and task assignment.
_Avoid_: admission (unqualified), launcher, TerminalRunner
_Code_: folder `src/procedures/launch/`; Effect service `LaunchAdmission`.

**Preflight**:
The checks of a launch that change nothing: a strict settings read, the launch
plan, the launch revision and the look for an unresolved attempt.
_Avoid_: dry run, check (unqualified)
_Code_: function `preflight`.

**Prepare step**:
The caller's own effects that run after a launch's intent is recorded and
before its terminal is started, such as making the worktree.
_Avoid_: setup, pre-send (for this step)
_Code_: parameter `prepare`; type `Prepared`.

**Send permit**:
A value only launch admission can make, after recording a launch as
Uncertain, and the only key to the herdr-core call that starts a terminal.
_Avoid_: run words, RunWords, token (for a permit)
_Code_: type `SendPermit`.

**Launch revision**:
A digest of what a launch was admitted on (route, plan fingerprint, the words
it will run, its space and role), compared again just before send.
_Avoid_: revision (unqualified), version, counter (for a launch revision)
_Code_: type `LaunchRevision`; function `launchRevisionOf`.

**Positive evidence**:
An observation that one attempt's effect happened, naming exactly one result:
one terminal labelled with its attempt id, an address in herdr-core's reply,
an agent running in the terminal a revival typed into, a remote job's result
files, or a pull request carrying its attempt id. Only adapters make it.
_Avoid_: proof (unqualified), receipt, look (for evidence)
_Code_: type `PositiveEvidence`; its absence is `NoEvidence`.

**Closure command**:
A person-only command that asks the kernel to close one unresolved attempt:
`launch recover` closes an intended one as not applied, and `launch reconcile`
closes an uncertain one as completed on positive evidence.
_Avoid_: recover, reconcile (except as these two command routes), settle, release, repair (for a closure)
_Code_: function `closeAttempt`; command routes stay `launch recover` and
`launch reconcile`.

**Revival**:
Typing an agent back into its own kept terminal after a crash, a power loss or
a reboot.
_Avoid_: restart (for a revival), respawn
_Code_: tag `Revival`; function `revive`.

**Restart**:
A new launch that replaces the agent of a running Assistant or tab agent.
_Avoid_: reboot, relaunch
_Code_: function `restartAgent`.

**Switch**:
Replacing a task's agent with an agent of another agent CLI.
_Avoid_: swap
_Code_: function `switchAgent`.

**Resume**:
A launch that continues a recorded session on its recorded binding.
_Avoid_: continue (as a noun), reattach
_Code_: function `resumeTask`.

**Backup**:
The one takeover of a stuck task agent by the other agent CLI.
_Avoid_: takeover, failover
_Code_: type `Backup`.

**Conversation fork**:
A tab agent started from another agent's saved conversation.
_Avoid_: fork (unqualified)
_Code_: tag `ConversationFork`.

**Missing history**:
The case of a revival or restart whose session is gone, so the agent starts a
new conversation with a handover.
_Avoid_: lost session (for this case)
_Code_: field `missingHistory`.

### Publication and forges

**Publication stage**:
One of the three attempts of a Bitbucket publication: push the branch, open
the draft pull request, mark it ready.
_Avoid_: step (for a stage)
_Code_: type `PublicationStage` (`push`, `draft`, `ready`).

**Publication record**:
The record of one published task branch, holding its owner, its push remote
and its stages.
_Avoid_: claim, publication claim
_Code_: folder `src/domains/publication/`; type `PublicationRecord`.

**Attempt id line**:
The `Herdr-Operation: <attempt id>` line a publication stage writes into a
pull request, so that an observer can find that stage's result.
_Avoid_: operation (for this line)
_Code_: function `attemptIdLine`.

**Push remote**:
The git remote and push URL a publication pushes to, with every URL git shows
for that remote.
_Avoid_: route (for a push remote), origin (unqualified)
_Code_: type `PushRemote`.

**Forge kind**:
Which forge a repository identity belongs to: `github` or `bitbucket`.
_Avoid_: provider (for a forge)
_Code_: type `ForgeKind`; field `forge`.

**Matched repository**:
A repository identity checked equal to the one its task saved. Forge adapters
accept only this.
_Avoid_: bound forge, BoundForge, bindForge
_Code_: type `MatchedRepository`; function `matchRepository`.

**Merge permit**:
A value only the merge decision makes, from a check observation that passed on
GitHub, and the only key to a GitHub merge. No Bitbucket merge permit exists.
_Avoid_: MergeAdmitted, admitted merge
_Code_: type `MergePermit`; function `decideMerge`.

**Destination watch**:
A destination branch watched on GitHub after a merge, until its checks turn
green or red.
_Avoid_: main watch, MainWatch
_Code_: type `DestinationWatch`.

### Providers and settings

**Provider route**:
How an agent reaches its model: Personal or Azure AI Foundry.
_Avoid_: route (unqualified; the kernel's route is a command's words), provider (for a route), backend
_Code_: folder `src/domains/provider-route/`; type `ProviderRoute`; prefix
`providerRoute`.

**Personal**:
The provider route that uses the agent CLI's own sign-in. A missing settings
file means Personal.
_Avoid_: default route, subscription
_Code_: literal `personal`.

**Azure AI Foundry**:
The provider route through Azure model deployments. It runs only on the
settings owner.
_Avoid_: azure (unqualified), Foundry (alone)
_Code_: literal `azure-foundry`.

**Model provider**:
The outside service that hosts a model and answers its calls.
_Avoid_: provider (unqualified), LLM vendor
_Code_: folder `src/adapters/model-providers/`; Effect service `ModelProviders`.

**Recorded binding**:
The provider route, deployment and fingerprint a launch recorded, which a
resume plans from instead of today's settings.
_Avoid_: binding (unqualified), ProviderBinding, provider record
_Code_: type `RecordedBinding`; prefix `recordedBinding`.

**Launch plan**:
How a launch will reach its model: its provider route, fingerprint, the
nonsecret environment and the credential name it needs.
_Avoid_: plan (unqualified), route plan
_Code_: type `LaunchPlan`; functions `planNewConversation` and
`planFromRecordedBinding`.

**Fingerprint**:
A digest of a route's routing: its resource or endpoint and its sign-in.
_Avoid_: hash (for a fingerprint), signature
_Code_: field `fingerprint`.

**Credential name**:
The name of the environment variable an agent needs for its route. Its value
never passes through this program.
_Avoid_: credential (for the name), key (unqualified)
_Code_: field `credentialName`.

**Secret**:
A value that travels only on a child process's standard input, never in its
arguments or environment.
_Avoid_: token (unqualified), password
_Code_: type `Secret`.

**Settings file**:
The person's `settings.json`. It stays live after the clean cutover, and an
unreadable one refuses; it is never read as Personal.
_Avoid_: config (unqualified), preferences
_Code_: schema `SettingsFile` in `src/state-files/settings.ts`; adapter folder
`src/adapters/settings/`, Effect service `Settings`; value `SettingsView`.

**Settings layer**:
One of the three layers of the settings file: a space, a machine and
Everywhere. The most specific layer wins.
_Avoid_: level, scope (the kernel's conflict scope)
_Code_: type `SettingsLayer`.

**Everywhere**:
The settings layer that applies to every machine and space.
_Avoid_: global, default (for this layer)
_Code_: field `everywhere`.

**Settings owner**:
The machine whose settings file is the original. Azure AI Foundry runs only
there.
_Avoid_: owner (unqualified), main machine
_Code_: field `settingsOwner`.

**Settings digest**:
A digest of the settings file's bytes, compared before a write so that a
concurrent writer is not overwritten.
_Avoid_: settings version, etag
_Code_: type `SettingsDigest`.

**Selection revision**:
The counter of a task's model selection, which refuses a stale selection.
_Avoid_: revision (unqualified), select rev
_Code_: type `SelectionRevision`. On disk it is `select_rev`.

**Task settings**:
A task's own overrides of the settings file: review, proof, review rounds,
must fix and merge.
_Avoid_: task config
_Code_: type `TaskSettings`.

**Model pick**:
A pinned or recently used model, written `<agent CLI>:<model>`.
_Avoid_: favourite
_Code_: type `ModelPick`.

**Agent CLI**:
The command-line program an agent runs in: Claude Code (`claude`) or Codex
(`codex`).
_Avoid_: agent, harness, tool (for the program)
_Code_: type `AgentCli`.

### Machines

**Machine**:
A computer herdr-core links. `local` names this machine.
_Avoid_: host (unqualified), node, peer, box (for a machine)
_Code_: type `MachineName`; prefix `machine`.

**Remote machine**:
A machine other than this one, reached through herdr-core.
_Avoid_: remote (unqualified), peer (for a remote machine)
_Code_: folder `src/adapters/remote-machines/`; Effect service `RemoteMachines`.

**Machine link**:
herdr-core's connection from one machine to another.
_Avoid_: link (unqualified), tunnel
_Code_: type `MachineLink`.

**Reach map**:
The machines reachable from here, hop by hop over machine links.
_Avoid_: graph (unqualified), topology
_Code_: folder `src/domains/reach/`; type `ReachMap`; function `probeReach`.

**Health probe**:
Reading a machine's load, memory and disk by running plain commands there and
parsing their output here.
_Avoid_: probe (unqualified), ping
_Code_: function `probeHealth`.

**Machine hold**:
A hold on new starts because a machine's health is past its limits.
_Avoid_: throttle, backoff (for a hold)
_Code_: type `MachineHold`.

**Remote command**:
A command run on another machine's folders, written `--on <machine>`. Its
lost reply is looked up by its attempt id, never sent again blind.
_Avoid_: remote (unqualified), forward, relay (as a noun)
_Code_: type `RemoteCommand`; function `relayCommand`.

**Remote job**:
An action run on another machine as a background terminal that writes its
result files there.
_Avoid_: job (unqualified), action job
_Code_: type `RemoteJob`; launch identity kind `job:`.

**Remote install**:
This program on a remote machine: the Bun runtime, one bundle, a shim and an
install marker.
_Avoid_: sync (for an install), deploy, zipapp
_Code_: function `ensureInstalled`.

**Bundle**:
This program built into one JavaScript file, named by its content digest.
_Avoid_: zipapp, binary (for a bundle)
_Code_: prefix `bundle`.

**Install marker**:
The file under the tasks folder that records which bundle a remote machine has.
_Avoid_: stamp (the kernel template's word), tools file
_Code_: prefix `installMarker`.

**Scheduler**:
The one long-lived process on each machine that runs ticks, in the kept
terminal `herdr-automations`.
_Avoid_: cron, runner (for the scheduler)
_Code_: daemon role `scheduler`.

**Tick**:
One round of passes, one at a time on each machine.
_Avoid_: round, loop, cycle (for a tick)
_Code_: folder `src/procedures/tick/`; Effect service `TickProcedures`;
function `runTick`.

**Pass**:
One isolated piece of periodic work, such as a tick's queue pass or news pass,
run on its trigger.
_Avoid_: job (for periodic work), timer, DaemonJob
_Code_: suffix `Pass` (`queuePass`); constant `DAEMON_PASSES`.

**Tick lock**:
The lock that keeps a second tick from starting on the same machine.
_Avoid_: lock (unqualified), mutex
_Code_: prefix `tickLock`. On disk it is `.tick.lock`.

**Serving machine**:
The one machine that serves the web app on the tailnet, elected as the newest
record in the `shepherdr.host` document.
_Avoid_: host (unqualified), main, server (for this machine)
_Code_: type `ServingMachine`; function `electServingMachine`.

### Store and import

**Store**:
This program's SQLite database on one machine, in write-ahead mode with full
synchronisation.
_Avoid_: state files (for the store), database (in names), db, ledger, journal (unqualified; the kernel's)
_Code_: folder `src/adapters/store/`; Effect service `Store`; prefix `store`.

**Store transaction**:
One atomic change to the store.
_Avoid_: transaction (unqualified; the kernel's), lock (for a transaction)
_Code_: function `Store.transact`.

**Old system**:
Shepherdr as forked at `9859c344`, which this design replaces.
_Avoid_: legacy, the fork (unqualified), Python version
_Code_: prefix `oldSystem`.

**Old install**:
An installed copy of the old system on one machine, with its state files.
_Avoid_: legacy install, live install
_Code_: prefix `oldInstall`.

**Fork checkout**:
A git checkout of the old system's source, which the interface inventory reads.
_Avoid_: fork (unqualified), upstream
_Code_: prefix `forkCheckout`; command option `--fork` stays.

**Old service**:
The old system's Bun HTTP and WebSocket program under `service/`.
_Avoid_: server, backend (for the old service)
_Code_: writer literal `service` and file names under `src/state-files/` only.

**State file**:
One file the old install keeps its state in. The import reads each once at the
clean cutover; only the settings file stays live after it.
_Avoid_: journal (for a state file), store (for a state file)
_Code_: folder `src/state-files/`.

**State root**:
The folder state file paths are written from: a home folder on the default
layout.
_Avoid_: root (unqualified), home (for this folder)
_Code_: parameter `stateRoot`.

**State file registry**:
The one list of every state file, with its path, format, schema, writers and
write discipline.
_Avoid_: manifest, catalogue (for the registry)
_Code_: file `src/state-files/registry.ts`; constant `stateFiles`; function
`findStateFile`.

**State file entry**:
One row of the state file registry.
_Avoid_: descriptor, StateFile (for a row)
_Code_: type `StateFileEntry`.

**State file family**:
A group of state files that share an owner and a purpose: `task-lists`,
`attempts`, `engine-state`, `settings`, `service-state`, `machine-state` and
`herdr-core`.
_Avoid_: category, kind (for a family)
_Code_: type `Family` in `src/state-files/registry.ts`; file stems in
`src/state-files/` match the families.

**State file writer**:
A program of the old install that writes a state file today.
_Avoid_: owner (for a writer)
_Code_: type `Writer`; field `writers`.

**Write discipline**:
How a state file's writers put it on disk: rename, in place or append, with
the lock they hold and whether they sync first.
_Avoid_: durability (for the old files)
_Code_: type `WriteDiscipline`.

**Import schema**:
An Effect schema that describes one state file exactly as the old install
writes it.
_Avoid_: model, DTO, lossless codec (for an import schema)
_Code_: suffix `File` for a whole file and `Line` for one line of a JSON-lines
file (`LaunchesFile`, `StopsLine`).

**Round trip**:
Decoding a state file with its import schema, encoding it back and comparing
the result with what was read.
_Avoid_: lossless (for this check), echo
_Code_: file `round-trip`; function `roundTrip`; type `Verdict`.

**Finding**:
A place where a document broke its import schema and what the schema wanted
there, never the value.
_Avoid_: error (for a finding), issue (unqualified)
_Code_: type `Finding`.

**Import**:
The one reading of the old install's state files into the store at the clean
cutover.
_Avoid_: migration (unqualified), migrate (the old layout move), sync (for the import)
_Code_: folder `src/state-files/`; function `importStateFiles`.

**Clean cutover**:
The move from the old install: it is stopped, its state files are imported
once, and nothing of the old system touches the state after that.
_Avoid_: side by side, dual run
_Code_: none.

**Interface inventory**:
The lists of the old system's interfaces read from a fork checkout and kept
under `inventory/`: herdr-task commands, service routes and actions, herdr-core
RPC methods, hc subcommands, terminal labels and diagram elements.
_Avoid_: inventory (for the kernel's effect inventory), catalogue
_Code_: folder `src/inventory/`; types `List` and `Item`.

### herdr-core link

**herdr-core link**:
The one framed JSON-RPC connection a process holds to herdr-core
(`hc connect`). Every herdr-core call goes through it.
_Avoid_: core (unqualified), client (unqualified), socket (for the link)
_Code_: folder `src/adapters/herdr-core/`; Effect service `HerdrCore`; prefix
`herdrCore`.

**Link lost**:
herdr-core is not reachable: `hc` exits 5 with `unavailable`, or the link
drops.
_Avoid_: down, offline
_Code_: error `HerdrCoreUnavailable`.

**herdr-core reply**:
herdr-core's answer to one call.
_Avoid_: response (for herdr-core), result (that is a command's)
_Code_: prefix `reply`.

**Terminal**:
A process herdr-core runs and keeps, with its labels.
_Avoid_: pane, tab, window, session (for a terminal), shell
_Code_: type `Terminal`.

**Terminal address**:
The address herdr-core gives a terminal, written `<machine>/<address>` when it
is on another machine.
_Avoid_: address (unqualified), terminal id, pane id
_Code_: type `TerminalAddress`; prefix `terminalAddress`.

**Terminal label**:
A `herdr.*` key and value on a terminal, such as `herdr.task` or
`herdr.launch`.
_Avoid_: tag, annotation (for a label)
_Code_: type `TerminalLabel`.

**Kept terminal**:
A terminal herdr-core keeps after its program exits, so that an agent can be
typed back into it.
_Avoid_: zombie, dead terminal
_Code_: flag `keep`.

**Shared document**:
A named herdr-core document with versioned writes, such as `shepherdr` or
`shepherdr.host`.
_Avoid_: doc (unqualified), document store
_Code_: type `SharedDocument`; functions `readSharedDocument` and
`updateSharedDocument`.

**Real environment guard**:
The check that refuses to build the herdr-core link outside the account's own
home, sockets and session.
_Avoid_: guard (unqualified), sandbox check
_Code_: error `RealEnvironmentRefused`.

**Window**:
herdr-app's desktop window, which is third party.
_Avoid_: app (unqualified), desktop
_Code_: writer literal `window`.

**Window mod**:
A plain JavaScript mod running inside the window.
_Avoid_: plugin (for a window mod), extension
_Code_: folder `src/adapters/window/` when built.

**Space**:
An area of the window that groups a folder's agents under one Assistant.
_Avoid_: workspace, room, project (for a space)
_Code_: type `SpaceId`; prefix `space`.

**Agent**:
An agent CLI running in a terminal for one role.
_Avoid_: bot, AI (for an agent)
_Code_: prefix `agent`.

**Assistant**:
The agent that coordinates a space's tasks and talks with the person.
_Avoid_: coordinator (outside wire names), Stage Manager
_Code_: tag `AssistantLaunch`; role literal `coordinator` stays on the wire.

**Worker**:
The agent that does a task's work.
_Avoid_: task agent, coder
_Code_: role literal `worker`.

**Reviewer**:
An agent that reviews a task's work in review rounds.
_Avoid_: checker, critic (for a reviewer)
_Code_: role literal `reviewer`.

**Tab agent**:
An agent in a chat tab of a space that is not its Assistant.
_Avoid_: chat agent, side agent
_Code_: launch identity kind `agent:`.

**Session**:
An agent CLI's saved conversation, which a resume continues.
_Avoid_: terminal (for a session), chat (for a session)
_Code_: prefix `session`.

### Transport and web

**Daemon**:
The long-lived entry of this program, running the scheduler role or the
service role.
_Avoid_: server, background process (for the daemon)
_Code_: file `src/daemon.ts`.

**Daemon role**:
What a daemon runs: `scheduler` or `service`.
_Avoid_: mode (for a role)
_Code_: type `DaemonRole`.

**Service role**:
The daemon role that serves HTTP and WebSocket requests for the web app.
_Avoid_: service (unqualified), backend
_Code_: Layer `ServiceRoleLayer`.

**Transport**:
The adapter over `Bun.serve` that carries HTTP requests and WebSocket messages,
with publish and subscribe for live state.
_Avoid_: Api, http (as a module name), router
_Code_: folder `src/adapters/transport/`; Effect service `Transport`.

**Request admission**:
The rule that admits an HTTP request: the tailnet owner only, the exact host
and origin, `x-shepherdr: 1` on writes, a loopback host and the local token
for local callers.
_Avoid_: gate (for this rule), auth (for this rule), middleware
_Code_: folder `src/domains/request-admission/`; function `admitRequest`;
types `RequestFacts` and `RequestAdmissionConfig`.

**Local token**:
The bearer token a local caller sends to the service role.
_Avoid_: token (unqualified), API key
_Code_: type `LocalToken`.

**Tailnet**:
The person's Tailscale network, where the web app is served under
`/shepherdr` and never funnelled.
_Avoid_: VPN, mesh
_Code_: folder `src/adapters/tailnet/`; Effect service `Tailnet`.

**Tailnet owner**:
The person, as Tailscale names them.
_Avoid_: admin, user (for the tailnet owner)
_Code_: field `tailnetOwner`.

**Live view**:
The snapshot of tasks, terminals and spaces the web app shows, with its stream
of changes.
_Avoid_: feed, dashboard (for this view)
_Code_: folder `src/procedures/live-view/`; Effect service `LiveView`.

**Web app**:
The FoldKit application the person uses in a browser.
_Avoid_: frontend, client (for the web app), UI (unqualified)
_Code_: prefix `webApp`.

**Daemon lock**:
The socket lock that keeps a second service role from starting on a machine.
_Avoid_: lock (unqualified), pid file
_Code_: prefix `daemonLock`.

### Command line and results

**Program**:
One of the names this one binary answers to: `herdr-task` or `shepherdr`.
_Avoid_: tool (for a program), app (for a program)
_Code_: type `ProgramName`.

**Command entry**:
The short-lived entry that people and agents run: it parses, finds the caller,
runs one command and prints its result.
_Avoid_: main (unqualified), launcher
_Code_: file `src/cli.ts`.

**Command table**:
The one list of every command, from which help, discovery, the allow-list
check and both renderers are derived.
_Avoid_: router, command registry
_Code_: file `src/commands.ts`; constant `commands`.

**Command handler**:
The function a command's entry in the command table runs.
_Avoid_: action (the old service's word), controller
_Code_: file `<area>/handlers.ts`.

**Agent-facing command**:
A command that role templates and permission allow-lists name, such as
`herdr-task ready` or `status`. Its words and output cannot change.
_Avoid_: public command
_Code_: none; the command table marks it.

**Person-only command**:
A command that refuses every caller but the person, such as `done` or a
closure command.
_Avoid_: admin command, privileged command
_Code_: function `requirePerson`.

**Caller**:
Who runs a command: the person, an agent or the scheduler.
_Avoid_: actor, user, principal (for a caller)
_Code_: folder `src/domains/caller/`; types `Caller`, `PersonCaller`,
`AgentCaller` and `SchedulerCaller`.

**Person**:
The one human who owns the install and decides what is Done.
_Avoid_: owner (unqualified), user, operator (for the person)
_Code_: type `PersonCaller`.

**Caller resolver**:
The adapter that finds the caller from the terminal's labels and whether a
person is at a terminal.
_Avoid_: auth (for this), whoami
_Code_: folder `src/adapters/caller/`; Effect service `CallerResolver`.

**Resend safety**:
Whether a command may be sent again when the daemon never saw it: `safe` or
`once`.
_Avoid_: replay (unqualified), idempotent (in names), retryable (the kernel's field)
_Code_: field `resend`.

**Plain JSON output**:
The bare `--json` output that today's agents and role templates read, as
opposed to the result envelope.
_Avoid_: legacy output, raw output
_Code_: prefix `plainJson`.

### Design words in use

**Domain core**:
The pure modules under `src/domains/`: state machines, transitions and
decisions with no input or output of their own.
_Avoid_: domain (for a command handler), business logic, model (for the domain core)
_Code_: folder `src/domains/<area>/`.

**Procedure**:
An Effect service that sequences domain core decisions with adapters for one
area, such as tasks, ticks or publication.
_Avoid_: operation (the kernel's), ops, use case, workflow, service (unqualified)
_Code_: folder `src/procedures/<area>/`; Effect service `<Area>Procedures`
(`TaskProcedures`), except `LaunchAdmission` and `LiveView`.

**Entry**:
One of the two shallow starts of this program: the command entry and the
daemon.
_Avoid_: main (unqualified), bootstrap (the Agent ecosystem's word)
_Code_: files `src/cli.ts` and `src/daemon.ts`.

**Layer graph**:
The one Effect Layer graph both entries are built from.
_Avoid_: container (for the layer graph), wiring (unqualified)
_Code_: file `src/app/layers.ts`; Layers `CommandLayer`, `SchedulerRoleLayer`,
`ServiceRoleLayer` and `TestLayer`.

**Effect service**:
A `Context.Service` class with a `layer` and a `layerTest`.
_Avoid_: service (unqualified), injectable, provider (for a service)
_Code_: class per module; static `layer` and `layerTest`.

**Test layer**:
An Effect service's `layerTest`: an adapter that keeps its state in memory and
runs the same pure transitions.
_Avoid_: mock, stub (for a test layer)
_Code_: static `layerTest`.

**Transition**:
A pure change to one value that returns the new value and an answer, or a
refusal, and runs no effect.
_Avoid_: reducer, mutation, update (unqualified)
_Code_: type `Transition<S, A, E>`.

**Permit**:
A value only one module can make, which another module's interface requires.
_Avoid_: token (for a permit), proof (unqualified), witness (the template's word), admitted
_Code_: suffix `Permit` (`SendPermit`, `MergePermit`).

**Design candidate**:
One of the three designs scored for this repository; candidate 1 is the base.
_Avoid_: candidate (unqualified; the old glossary's Candidate is a commit)
_Code_: none.

## Names in code for words owned elsewhere

These words keep the meaning their owner gives them. This table says only how
this repository names them in code.

| Word                                              | Owner         | Name in code                                                                         |
| ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Operation, operation id                           | CLI kernel    | `operationId`, only as the kernel hands it over; no folder, type or function of ours |
| Intent                                            | CLI kernel    | `intent`; the attempt state before its effect starts is Intended                     |
| Effect (a declared effect)                        | CLI kernel    | `effectId`; a variable holding an Effect program is never named `effect`             |
| Closure, closure disposition                      | CLI kernel    | `closeAttempt`, `ClosureDisposition` (`completed`, `not-applied`, `outcome-unknown`) |
| Observer, observation                             | CLI kernel    | functions `observe<Thing>` (`observeLaunch`), type `Observation`                     |
| Conflict key                                      | CLI kernel    | function `conflictKeyOf`, from a launch identity                                     |
| Unresolved case                                   | CLI kernel    | a kernel record; ours is an unresolved attempt                                       |
| Outcome                                           | CLI kernel    | type `Outcome` (`success`, `refused`, `failed`); never `<X>Outcome`                  |
| Result, envelope                                  | CLI kernel    | types `CommandResult` and `Envelope`; file `src/command-result.ts`                   |
| Station, cause code, failure class, exit code     | CLI kernel    | `stations`, `causeCode`, `failureClass`, `exitCode`                                  |
| Handoff, next action, repair action               | CLI kernel    | `handoff`, `nextAction`, `repairAction`                                              |
| Transaction state, effect class, run id           | CLI kernel    | `transactionState`, `effectClass`, `runId`                                           |
| Command identity                                  | CLI kernel    | `commandIdentity`, written `shepherdr.<route words>`                                 |
| Route (a command's words)                         | CLI kernel    | `route`, only on a command definition                                                |
| Handler entry, dispatch                           | CLI kernel    | none of ours; a test title says "before handler entry"                               |
| Task, hold, dependency                            | Old Shepherdr | `src/domains/task/`, `Task`, `Hold`, `Dependency`, `ExternalDependency`              |
| Readiness, completion, cleanup                    | Old Shepherdr | `markReady`, `src/domains/completion/`, `Cleanup`                                    |
| Forge, forge adapter                              | Old Shepherdr | `src/adapters/forge/`, `GitHubForge`, `BitbucketForge`                               |
| Repository identity, pull request identity        | Old Shepherdr | `RepositoryIdentity`, `PullRequestIdentity`                                          |
| Candidate, source branch, destination             | Old Shepherdr | `candidateCommit`, `sourceBranch`, `Destination` (its branch is `base` on disk)      |
| Publication, uncertain publication                | Old Shepherdr | `src/domains/publication/`, `PublicationRecord`; an Uncertain publication stage      |
| Check observation, approval evidence, integration | Old Shepherdr | `CheckObservation`, `ApprovalEvidence`, `Integration`                                |
| Execution host, application host                  | Old Shepherdr | `executionHost`, `applicationHost`, each a `MachineName`                             |
| Module, Interface, Seam, Adapter                  | Design words  | an Adapter lives in `src/adapters/<dependency>/`, one for each outside dependency    |
| Implementation, Depth, Leverage, Locality         | Design words  | none                                                                                 |

## Words that need a qualifier

Each of these words names different things in this repository's sources. In
the name of a file, a folder, a type, a function, a variable or a test, pair
it with the word that says which one is meant.

_Qualify_: core, fork, route, revision, binding, identity, owner, service, journal, provider, host, job, lock, address, status, operation, claim
