# What the CLI kernel would need for Shepherdr

A sized list of the changes `agent-cli-kernel` would need before Shepherdr
could run on it. Read against the kernel at commit `4be9a377` on 2026-11-19.
Paths are in the kernel repository.

Sizes are relative: small is one focused change, medium is a feature with its
tests, large changes a design that is currently frozen or needs new evidence.
No item has been tried. "Checked" means the cited line was read here; "report"
means it comes from the fit analysis and was not re-read.

## Tier 1: the kernel at the command-line edge

The daemon keeps starting the command-line tool for each action, as the old
service does today.

| #   | Change                                                        | Size            | Why Shepherdr needs it                                                                                                                                                                                             | Source                                                                                                  |
| --- | ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | Closing a crashed or uncertain operation works in production  | Large           | `launch recover` and `launch reconcile` map to it. Today the qualification table is empty, so every platform reports that it cannot prove an owner has stopped, and a crashed start would block its task for good. | Checked: `kernel/src/addons/state/qualification.ts:16`, `install.ts:399`                                |
| 2   | The operation id is available before the effect runs          | Small           | The terminal must be labelled with the id at send, so it can be found later as evidence.                                                                                                                           | Checked: the id is made inside `begin` (`install.ts:658`). Report: the handler sees it only afterwards. |
| 3   | Closed operations are pruned, and admission stops reading all | Medium          | Every admission reads every operation folder. Shepherdr starts agents all day and prunes launch records after 30 days.                                                                                             | Checked: `kernel/src/addons/state/store.ts:480`                                                         |
| 4   | Variadic operands and plain JSON output, or new agent output  | Small to medium | `herdr-task ready "some words"` and bare `--json` output are what agents and role templates use today. The kernel offers neither. Changing the agents' output instead is Shepherdr work.                           | Report                                                                                                  |
| 5   | Stamping exists                                               | Already planned | MAG-123 to MAG-128, six tickets in Backlog. The package also still carries the template's name.                                                                                                                    | Linear MAG-114                                                                                          |
| 6   | Host tooling fit                                              | Small to medium | The kernel relies on a Fallow baseline; this repository gates every finding. Compiler pins differ (7.1.0-beta against 7.0.2). Test-only exports would be flagged as unused.                                        | Report                                                                                                  |

## Tier 2: the kernel inside the daemon too

Needed for the chosen design, where nothing starts the command-line tool to
talk to itself.

| #   | Change                                              | Size            | Why Shepherdr needs it                                                                                                                                                                | Source                                                                               |
| --- | --------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 7   | More than one transaction per process               | Large           | The kernel allows one transaction per run and ends the process itself. The scheduler and the service role are long-lived and start many agents. This reopens the frozen state design. | Checked: `kernel/src/kernel/state-seam.ts:355`, `kernel/src/kernel/lifecycle.ts:790` |
| 8   | Programs add-on takes stdin and long-lived children | Medium          | The herdr-core link is a long-lived child with piped input, and secrets travel by stdin. The add-on ignores stdin, and the kernel's lint bans spawning a process anywhere else.       | Checked: `kernel/src/addons/programs/index.ts:185`. Report: the lint rule.           |
| 9   | Effect fits                                         | Small to medium | Handlers do not receive the abort signal, so Effect finalizers would not run on a deadline or a stop signal. Effect's logger needs a sanctioned route into the diagnostics add-on.    | Report                                                                               |

## Shepherdr's side, not kernel work

- Encode launch identities. `#` is not an allowed key character (checked:
  `kernel/src/addons/state/scope.ts:118`).
- Re-check the settings revision before recording the effect. The kernel
  stores revisions and never re-checks them (report).
- Make each Bitbucket publication stage its own operation. The kernel forbids
  a later run writing for an earlier one (report).
- Supply the observer that finds one labelled terminal as evidence.
- Accept two stores. Launches would live in the kernel's journal and tasks in
  SQLite, so a confirmed start could not release its intent and reach its task
  in one transaction. The repair path the design deletes would come back.

## Hard either way

- **Proving the person.** "Only the person marks Done" maps to the approval
  add-on, but nothing checks who wrote a grant, and its non-forgeability case
  is still pending in the kernel's own case table. An agent running as the
  same user could write its own grant. Shepherdr has the same limit without
  the kernel.

## Bottom line

- **Tier 1** is three kernel changes (one large, one medium, one small), an
  output decision, and the six stamping tickets already on the board.
- **Tier 2** adds three more, one of them large, and that one reopens a
  design the kernel has frozen.
- The largest single item in either tier is closure in production. Its code
  exists and is tested through a fixture; what is missing is the qualification
  evidence for each platform, and a decision on how exactly an operating
  system release must match.

## Not determined

- Whether the kernel's own tests pass on this Mac.
- How well the code matches the Contract 3 text, which was not readable here.
- Whether one compiled binary can carry the kernel's worker and its
  foreign-function lock.
