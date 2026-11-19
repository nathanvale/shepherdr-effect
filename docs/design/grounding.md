# Grounding for the Effect v4 design

The brief every design candidate works from. Facts were read from the fork at
`9859c344`, the running pilot, and Effect's own sources on 2026-11-19. Paths
are relative to the fork root unless they start with `~` or `src/`.

## Sources

- Fork checkout, read-only: `/Users/nathanvale/code/herdr-projects` at
  `9859c3447a5b57e781310f254f0b1776ec4f1b25` (Shepherdr 3.1.35 plus fork work).
- Current C4 diagram: `https://mermaid.ai/app/projects/940d39a4-c08b-4b93-8c20-857afb8eff8c/diagrams/6b7364f4-7339-4543-a17b-73f1a15cbe26`.
- Pilot state copy, private, never committed:
  `~/.local/state/shepherdr-effect-design/pilot-state-20261119` (35 files).

## Decisions already made (Nathan)

- Runtime is Bun 1.4.4. No Python anywhere, including on other machines.
- TypeScript on Effect v4 (`effect` 4.1.4). FoldKit for the web app, proven by
  one screen and a terminal mount before it is trusted.
- A separate project, not a branch of the fork. Upstream changes are ported
  by hand.
- Window mods (28 plain JavaScript mods inside herdr-app) are out of scope for
  now. Record them as a later adapter.
- Clean cutover. The old install is stopped before the new system first runs,
  and no Python process touches the state after that. Today's files are read
  once, to import existing tasks and open claims.
- Storage is SQLite, through Bun's built-in `bun:sqlite`.
- The service transport is Bun's native WebSocket server (`Bun.serve`).
- herdr-core and herdr-app are third party. Their interfaces cannot change.

Correction, 2026-11-19: this brief first said "the first version reads and
writes today's on-disk files in place". That was the orchestrator's
assumption, not Nathan's decision. The three design candidates were written
and first scored under it, then scored again under the clean cutover. See
[synthesis.md](synthesis.md).

## What exists today

| Part                           | Size                     | Role                                                                                |
| ------------------------------ | ------------------------ | ----------------------------------------------------------------------------------- |
| `herdr-task` (Python)          | 20,400 lines, 42 modules | Task engine and CLI. Used by people, agents and the service.                        |
| Installer and helpers (Python) | 7,000 lines              | `shepherdr`, `herdr-secret`, `herdr-artifact`, `sync-shared`.                       |
| Service (Bun)                  | 10,300 lines, 56 modules | HTTP and WebSocket API, daemons, tailnet sharing. `service/main.ts` is 1,019 lines. |
| Web app (React 19)             | 28,400 lines             | Kernel plus 15 plugins. xterm.js terminal, voice, PWA.                              |
| `core/` (plain JS)             | 7,900 lines, 40 modules  | Pure shared logic with injected I/O.                                                |

Shape problems worth designing out:

- `herdr-task` top-level imports are layered, but 46 in-function imports tie
  30 of 42 modules into one cycle. `base.py` mixes paths, clock, subprocess,
  bundling and the environment guard (fan-in 35).
- `service/main.ts` is composition root, router, about 20 inline actions and
  several daemons. Dependencies are attached by property assignment.
- herdr-core is reached two ways: one JSON-RPC link (`hc connect`) and many
  `hc` CLI subprocesses. Eight of 19 required RPC methods are never called.
- The service asks `herdr-task` for work by spawning it and parsing `--json`.
- About 25 timers poll at 1 to 60 second periods.

## Invariants the design must keep

Launch admission (`mods/tasks/bin/herdr_task/launch_admission.py`):

- A start is claimed in `.launches.json` before any effect. States:
  `never-submitted`, `submission-uncertain`, `confirmed`, `cancelled`.
- One open claim per identity. A second start is refused.
- At send, the claim must still be the caller's own and the settings revision
  unchanged.
- `submission-uncertain` is never retried and never released without positive
  evidence (one labelled terminal, or an address in the reply).
- The journal is written whole, fsynced, renamed, and the folder fsynced. An
  unreadable journal refuses; it is never read as empty.
- Gap today: the scheduler terminal and remote action jobs call `hc run`
  without admission.

Publication (`publications.py`), forge (`forge.py`), providers (`providers.py`):

- A Bitbucket publication is claimed and fsynced before the push, the draft
  and the ready write. Uncertain stages reconcile only on their operation id.
- Forge identity is provider-qualified. A host or identity mismatch refuses
  before any call. Unknown GitHub checks never merge automatically. A
  Bitbucket merge is never sent.
- A missing settings file means Personal. An unreadable one refuses. A resume
  plans from the recorded binding. Stale selection revisions refuse. Azure
  runs only on the machine that owns the settings.

Tasks:

- Six stored states: `todo`, `scheduled`, `queued`, `running`, `ready`,
  `done`. Needs-you, merging, held and stopped are derived from live
  herdr-core reads.
- Only the person makes a task Done. Today nothing in code enforces this: the
  `done` command has no caller check; agents are held back by an allow-list.
  Nathan decided on 2026-11-19 that the Assistant may also mark a task Done,
  as a recorded relay of the person's request.
- One scheduler per machine, in a kept terminal named `herdr-automations`.
  One tick at a time (`.tick.lock`).

Service:

- Request admission in `service/auth.ts` `gate()`: tailnet owner only, exact
  host, origin and `x-shepherdr: 1` on writes; local callers need a loopback
  host and a bearer token; cross-site requests are refused.
- Single instance by a socket lock. Host election: newest record wins.
- Secrets travel by stdin only.

## Contracts that cannot change

- `hc` CLI: `ls`, `get`, `read`, `label`, `send`, `keys`, `kill`, `rm`,
  `attach --observe`, `run --bg --json --keep ... -- argv`, `exec [--on M]`,
  `file write --on M`, `machine ls`, `server status`. Exit 5 with
  `{"error":{"kind":"unavailable"}}` means the link is lost.
- `hc connect`: plain `hello {generation:1, framed:true}`, then frames of
  u32 channel, u8 kind, u32 length, little endian, 16 MiB cap; JSON-RPC with
  `rpc.discover`. Minimum core 0.1.14.
- Terminal labels: `herdr.task`, `herdr.task.space`, `herdr.agent`,
  `herdr.provider`, `herdr.coordinator`, `herdr.role`, `herdr.launch`,
  `herdr.resume`, `herdr.alert`, `herdr.action`, `herdr.chat*`, `herdr.space`.
- Shared herdr-core documents: `shepherdr` (flat key map with versioned
  writes), `shepherdr.host`, `shepherdr.node`, `shepherdr.web`,
  `shepherdr.secrets`, and host-owned `herdr-app`.
- Agent-facing commands in role templates and permission allow-lists:
  `herdr-task ready`, `reviewed`, `status`, `alert`, `feedback`, `show`,
  `list`, `where`. The Assistant also uses `add`, `start`, `accept`, `fix`,
  `merge`, `resume`, `reopen`, `done`, `tell-assistant` and others.
- Tailnet mount `/shepherdr`; `tailscale serve` only, never funnel.
- Other machines today receive a Python zipapp by `hc file write --on M` and
  run Python source piped over `hc exec --on M`. With no Python, each machine
  needs Bun plus one bundled file, or one compiled binary per platform.

## State files (owner, write discipline)

- Task lists `<slug>.json`: flock, temp file then rename.
- `.launches.json`, `.publications.json`: flock, fsync, rename.
- `.machines.json`, `.reach.json`, `.seen.json`, `.retries.json`,
  `.news.json`, `.held.json`, `.autopilot.json`, `.feedback.json`,
  `.scheduler.json`, `.stops.jsonl`, and others: rename only, some unlocked.
- Settings `~/.config/shepherdr/settings.json`: written by three programs.
- Service folder: `service.json`, `web.json`, `token`, `sent.json`,
  `usage.jsonl`, `push.json`, `host-base.json`.

## Effect v4 facts (verified, not from memory)

- `effect` 4.1.4 is `latest`. Platform, RPC, CLI, SQL core and cluster are
  merged into `effect`. Micro is removed.
- Services: `class X extends Context.Service<X, Shape>()("id") {}` with
  static `layer` and `layerTest`. No `Context.Tag`, no `Effect.Service`.
- `Effect.catch` (was `catchAll`), `Result` (was `Either`), `forkChild`,
  `forkDetach`. Entry: `BunRuntime.runMain(Layer.launch(AppLayer))`.
- Schema: `Schema.Struct`, `Schema.fromJsonString`,
  `Schema.decodeUnknownEffect`, `Schema.encodeEffect`, `check`, `decodeTo`.
- Subpaths: `effect/http`, `effect/http-api`, `effect/process`,
  `effect/persistence`, `effect/socket`. Bun: `@effect/platform-bun`.
- Marked unstable (may break in a 4.x minor): `http`, `http-api`, `process`,
  `socket`, `persistence`, `cli`, `rpc`, `cluster`, `workflow`, `FileSystem`,
  `Path`, and all of `@effect/platform-bun`. Wrap each behind our own service.
- Stable: `Effect`, `Layer`, `Context`, `Schema`, `Stream`, `Schedule`,
  `Scope`, `Config`.
- FoldKit 0.171.0: Elm-style (Model, Message, pure `update`, `view`), own
  virtual DOM, peers `effect ~4.1.0`. Pre-1.0, one maintainer. Imperative
  widgets go through `Mount.define`. No xterm.js integration exists.

## This repository's rules

- `bun run check` must pass: typed ESLint, Biome format, TypeScript, Bun
  tests, and the Fallow audit. Fallow flags unused files, exports and
  dependencies, so every stub must be reachable from an entry point or a test.
- One application CLI at `src/cli.ts`; commands are added in
  `src/commands.ts`; domain code lives under `src/domains/` and never writes
  to stdout or stderr.

## Where the state-file field groups come from

Field groups in `src/state-files` that carry no annotation take their meaning
from their names. Their origin in the old code:

- `agentRowFieldsBeforeTerminal`: launch.py `launch`. The agent row's part that
  exists before its terminal does.
- `oldPanelMigrationFields`: store.py `migrate`. Set once on a task taken over
  from the old Tasks panel.
- `ownChoicesInsteadOfSettings`: what runs the task and how, where the task
  says so itself instead of Settings.
- `fieldsWrittenAtIntent`: launch_admission.py `Admission.claimed`.
- `fieldsWrittenBeforeHcRunOrSend`: `_mark_sent`.
- `fieldsWrittenWhenLaunchCloses`: `_close`, `launch recover` and
  `launch reconcile`.

## Where the registry's and the settings file's facts come from

- `sectionsALevelMaySet` in `settings.ts`: core/settings.js and settings.py
  `DEFAULTS`. What a level may set for the agents and tasks under it.
- `.stops.jsonl` is rewritten whole with its last 500 lines, by whichever
  command ends an agent.
- Any other JSON file in the tasks folder is a folder's task list. A slug can
  start with a dot, so the name alone cannot tell; store.py `is_task_list`
  goes by content.
- `usage.jsonl`: past 2 MB the log is renamed to `usage.1.jsonl` and a new one
  begins.
- `renamedUnderSchedulerRoundAndWindowTickLock`: the scheduler's round and the
  window's tick write those files inside one lock.
- A `Writer` is a program that writes the file today, and a `WriteDiscipline`
  is how those writers put it on disk today. `fsync` says the bytes are synced
  before the rename.

## Where the inventory extractors' facts come from

What the extractors in `src/inventory` read in the old system's source, and the
choices they make about it.

`herdrTaskCommands` (the herdr-task CLI file, argparse):

- It lists every subcommand the file registers, nested verbs included
  (`auto add`), read from how the file calls argparse.
- `p = argparse.ArgumentParser(...)` is the parser every route starts from.
- `sub = p.add_subparsers(...)`: commands added to `sub` extend the route of
  `p`.
- `c = sub.add_parser("name", ...)` assigns the new parser to `c`. It is kept
  as a group when its own `add_subparsers` follows at once, else as a parser.
- `def cmd(name, ...)` whose body calls `sub.add_parser(name, ...)` is a
  command adder: `cmd("where", ...)` names the command, so the command is
  found at the adder's call, not in its body.
- A command is hidden when it is added with no `help=` argument.
- `argv[:1] == ["_job"]` is a first word the program acts on itself, which
  argparse never sees. A registered command also named there (`tick`) is
  listed once, as registered.

`serviceRoutes` (the service's request handler, JavaScript):

- The handler is found by what it does: the block that takes a variable from
  the URL's `pathname`, as in `const path = ...pathname...;`.
- A route is a comparison of that variable with a string, a `startsWith` call
  (a prefix, written with a final `*`) or a regex tested against it. `a.path`
  is some other object's path, not the request's.
- The block a position sits in is the nearest `{` before it that is still open
  there.
- A route is a WebSocket where the comparison is in the condition of an `if`
  that calls `upgrade`, or in the statement that sets a flag such an `if` tests
  alone, as in `const socket = path === "/api/ws"` followed by
  `if (socket) return srv.upgrade(...)`.
- A route's methods are those compared in any `if` condition that reaches it.

`hcCliSubcommands` (child processes the code starts):

- The whole text is searched, so a command line inside a script kept as a
  string is found too. Each pattern ends just before the first word after the
  program:
  - `.py`: `["hc", "get", ...]` and `[hc, "get", ...]`, where `hc` holds the
    program's path; `hc_json("get", ...)`.
  - `.ts`: `["hc", "get", ...]`; the same with `process.env.SHEPHERDR_HC ||`
    before `"hc"`; `hc(["get", ...])` and `this.hc(["get", ...])`, a function
    that puts the program first; `spawn(endpoint.binary, ["connect"], ...)`,
    the program and its words apart.
- The leading quoted words are read up to two. A variable or a spread ends
  them.
- A second plain word is part of the subcommand (`file write`, `machine ls`):
  an option, an address in a variable or a key name with a `+` is not.

`serviceActions` (`service/actions.ts` function `act`, `service/main.ts`
function `doAction`):

- An action is each `type` that function compares (`b?.type === "send"`) or
  switches on (`switch (b?.type) { case "send": ... }`), where `b` is one of
  its parameters. A switch's labels are read without those of any switch
  inside it.
- The body is taken to open at the first `{` after the parameters. A return
  type written as an object would be mistaken for it.

`herdrCoreRpcMethods` (`service/hc/client.ts`):

- A method can be required and never called: the client checks that the core
  has it and nothing uses it.
- A call may carry a type argument between the name and the bracket
  (`hub.call<{ code: number }>("machine.exec", ...)`).
- A required method is cited where the `REQUIRED` list names it, any other at
  its first call.

`terminalLabels`:

- A label is written at the start of a string: `"herdr.task"`,
  `f"herdr.space={id}"`, `` `herdr.chat=${pane}` ``. The quote before it keeps
  out `"shepherdr.host"` and `"https://herdr.dev"`. A final dot marks a prefix
  (`"herdr.secret.ask."`).

`diagramElements` (a Mermaid C4 diagram):

- A boundary is a frame around boxes, not a box, and a style line draws
  nothing: both are left out.
- An argument is a quoted text, which may hold commas, or a bare word.

The source files the extractors are given (`readSourcesAsText`):

- `python` is `mods/tasks/bin/herdr_task/*.py`. `service` is `service/*.ts`
  and `service/hc/*.ts`: the link to herdr-core is the one part of the service
  kept in a folder of its own. `coreFolder` is `core/*.js`.
- Test files (`*.test.*`) are left out, and a folder inside one of these
  folders is not entered.
- The diagram is not in the old system's checkout. This repository keeps its
  own copy at `docs/design/current-architecture.mmd`.
- Nothing in the checkout is run or written: its files are read as text.
