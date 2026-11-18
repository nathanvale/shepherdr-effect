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
- First version reads and writes today's on-disk files in place.
- herdr-core and herdr-app are third party. Their interfaces cannot change.

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
