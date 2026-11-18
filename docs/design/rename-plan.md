# Rename plan

Every name in `src/` and `tests/` that disagrees with
[GLOSSARY.md](../../GLOSSARY.md), the rename that fixes it, and the rules a
later names check can enforce. Nothing here has been renamed yet.

Read on 2026-11-19 at commit `0a718a9`, with the inventory worker's files as
they stood uncommitted that day. That work was committed later the same day
(`3022fe2` to `3b5430c`), and every line number below was checked again at
`94393a9`. Lines move as code changes: find each name again with the command
in its row.

## How to carry out one batch

1. Check the batch's "Ready" line. A batch marked "wait until the inventory
   work is committed" starts only when `git status --short` shows no change
   under `src/domains/inventory/`, `tests/inventory*`, `src/commands.ts` or
   `tests/cli.test.ts` that is not yours. At `94393a9` that condition holds.
2. Do the rows in order. "Every use" means every hit of
   `rg -n -w '<current name>' src tests`, and nothing else: rename identifiers,
   not words inside strings, unless the row says so.
3. Never change a wire name: an on-disk key inside `Schema.Struct({...})`, a
   literal the old install writes, a terminal label, a command route or a
   cause code. Only rows that say "value" change a string.
4. Run the batch's checks. All must pass:
   - `node_modules/.bin/biome format <changed files>` prints no difference;
   - `node_modules/.bin/eslint <changed files>` reports nothing;
   - `bun run typecheck` passes;
   - the batch's `bun test` files pass;
   - the batch's "Gone" command prints nothing.
5. Commit only the batch's files, with a pathspec:
   `git add -- <files>` then `git commit -m "<message>" -- <files>`.

## Naming rules

Each rule has an id so a lint or a names check can cite it.

### Files and folders

- **F1.** File and folder names are kebab-case.
- **F2.** A file stem names the glossary term it holds, or what it lists (an
  inventory list's name). Fixed stems: `index`, `handlers`, `layers`, `cli`,
  `daemon`, `commands`, `commands-contract`, `command-result`.
- **F3.** `commands.ts` is only the command table, `src/commands.ts`.
- **F4.** Command handlers live in `<area>/handlers.ts`.
- **F5.** A folder that holds many of one kind is plural (`adapters`,
  `domains`, `procedures`, `state-files`). An area folder is the glossary term
  (`domains/task`, `adapters/store`, `inventory`).
- **F6.** Nothing under `src/domains/` reads or writes files, starts
  processes, opens sockets or touches process streams.
- **F7.** No file or folder name holds a word an `_Avoid_` line lists without
  a note, or is one word from the `_Qualify_` list alone.
- **F8.** Files of the import schemas in `src/state-files/` are named after
  their state file family (`task-list`, `attempts`, `engine-state`).

### Types and schema constants

- **T1.** A type, class or schema constant is its glossary term in
  PascalCase. A qualifier that is its folder's own term may be dropped
  (`Verdict` in `round-trip.ts`, `Writer` in `state-files/registry.ts`).
- **T2.** An import schema for a whole state file is `<FileStem>File`: the
  file's stem in PascalCase, with dots and hyphens as word breaks
  (`.launches.json` is `LaunchesFile`). herdr-core's files take the prefix
  `HerdrCore`. A schema that serves several files, or a file found by a
  pattern, is named for what it holds (`SettingsPassFile`, `TaskListFile`).
  One line of a JSON-lines file is `<FileStem>Line`.
- **T3.** No name ends in `Outcome` except the kernel's `Outcome` itself.
  Other results are `<Thing>Result`.
- **T4.** A value only one module can make is `<Thing>Permit`.
- **T5.** A tagged error is `<Term><What went wrong>` (`HerdrCoreUnavailable`,
  `RealEnvironmentRefused`).

### Functions

- **V1.** A function name starts with a verb, and its noun is a glossary term.
- **V2.** Fixed verbs: `derive` for a pure derivation, `decide` and `plan` for
  a pure decision that may refuse, `read` and `list` for reads, `find` for a
  read that may find nothing, `is` and `has` for a boolean, `observe` for an
  observer, `probe` for a machine read. A transition is named for the state it
  enters: `markSent`, `confirm`, `refute`, `cancel`.
- **V3.** Never these verbs: `settle`, `reconcile` and `recover` (except the
  command routes `launch reconcile` and `launch recover`), `dispatch`,
  `handle`, `process`, `manage`, `do`.

### Variables, parameters and properties

- **N1.** A variable, parameter or property is its glossary term in
  camelCase. Ids end in `Id`, keys in `Key`, references in `Ref`.
- **N2.** Never one of these alone: `core`, `fork`, `route`, `revision`,
  `binding`, `identity`, `owner`, `service`, `operation`, `job`, `claim`,
  `address`, `lock`, `provider`, `host`. Qualify it with its term
  (`launchIdentity`, `providerRoute`, `terminalAddress`).
- **N3.** A module-level constant is the same words in SCREAMING_SNAKE_CASE
  (`HERDR_CORE`, `LAUNCH_ID`). A constant that holds an id ends in `_ID`.
- **N4.** A local that holds an Effect program is named for what it does, never
  `effect`, which is the kernel's word.

### Tests

- **S1.** Test files live under `tests/` as `<file stem or area>.test.ts`;
  fixtures are `<area>-fixtures.ts`.
- **S2.** A test title is a present-tense sentence about behaviour, in
  glossary words, that starts with its subject. It holds no avoided word, and
  says "JSON" for machine-readable output, since a machine is a computer here.
- **S3.** Test helpers follow V1 to V3 and N1 to N4.

## Batches

Kinds: folder, file, exported function, function, type, constant (a module
constant or schema constant, or a string value where the row says "value"),
variable (a local or a parameter), property, test name.

### Batch 1: import schema names

Done in 7b7da18.

Ready: now. Files: `src/state-files/*.ts` except `round-trip.ts`. Each name is
used only inside `src/state-files/`, so every row is a safe mechanical
rename. Rule: T2, except rows 1.1 to 1.4, 1.6, 1.32 and 1.33
(T1).

Tests: `bun test tests/state-files.test.ts tests/state-check.test.ts`.
Gone: `rg -n -w 'ProviderBinding|TaskJob|LaunchJournal|PublicationJournal|MachinesState|ReachMap|SchedulerRecord|SchedulerSeen|Retries|NewsState|NewsLog|HeldMessages|AutopilotState|FeedbackState|SettingsPassStamp|StopLogLine|CoreDocs|CoreTerminals|CliCheck|CodexSandbox|MigrateJournal|LayoutNumber|ServiceRecord|WebState|SentMessages|UsageEvent|ModelPicks|TaskAgent|MainWatch|TaskList' src tests`,
`rg -n 'schema: Settings\b|export const Settings\b' src` and
`rg -n 'const (Identity|Launch|Publication) ' src/state-files`. The word
"Settings" stays in comments, where it names the person's Settings page.

| #    | Kind     | Current name (path:line)                                  | Proposed name            | Glossary term      | Risk |
| ---- | -------- | --------------------------------------------------------- | ------------------------ | ------------------ | ---- |
| 1.1  | constant | `ProviderBinding` `src/state-files/shared.ts:17`          | `RecordedBinding`        | Recorded binding   | Safe |
| 1.2  | constant | `Identity` `src/state-files/journals.ts:13`               | `LaunchIdentity`         | Launch identity    | Safe |
| 1.3  | constant | `TaskJob` `src/state-files/journals.ts:18`                | `TaskAssignment`         | Task assignment    | Safe |
| 1.4  | constant | `Launch` `src/state-files/journals.ts:36`                 | `LaunchRecord`           | Launch             | Safe |
| 1.5  | constant | `LaunchJournal` `src/state-files/journals.ts:84`          | `LaunchesFile`           | Import schema      | Safe |
| 1.6  | constant | `Publication` `src/state-files/journals.ts:102`           | `PublicationRecord`      | Publication record | Safe |
| 1.7  | constant | `PublicationJournal` `src/state-files/journals.ts:176`    | `PublicationsFile`       | Import schema      | Safe |
| 1.8  | constant | `MachinesState` `src/state-files/engine-state.ts:13`      | `MachinesFile`           | Import schema      | Safe |
| 1.9  | constant | `ReachMap` `src/state-files/engine-state.ts:123`          | `ReachFile`              | Import schema      | Safe |
| 1.10 | constant | `SchedulerRecord` `src/state-files/engine-state.ts:126`   | `SchedulerFile`          | Import schema      | Safe |
| 1.11 | constant | `SchedulerSeen` `src/state-files/engine-state.ts:138`     | `SeenFile`               | Import schema      | Safe |
| 1.12 | constant | `Retries` `src/state-files/engine-state.ts:145`           | `RetriesFile`            | Import schema      | Safe |
| 1.13 | constant | `NewsState` `src/state-files/engine-state.ts:166`         | `NewsFile`               | Import schema      | Safe |
| 1.14 | constant | `NewsLog` `src/state-files/engine-state.ts:210`           | `NewslogFile`            | Import schema      | Safe |
| 1.15 | constant | `HeldMessages` `src/state-files/engine-state.ts:224`      | `HeldFile`               | Import schema      | Safe |
| 1.16 | constant | `AutopilotState` `src/state-files/engine-state.ts:243`    | `AutopilotFile`          | Import schema      | Safe |
| 1.17 | constant | `FeedbackState` `src/state-files/engine-state.ts:287`     | `FeedbackFile`           | Import schema      | Safe |
| 1.18 | constant | `SettingsPassStamp` `src/state-files/engine-state.ts:316` | `SettingsPassFile`       | Import schema      | Safe |
| 1.19 | constant | `StopLogLine` `src/state-files/engine-state.ts:333`       | `StopsLine`              | Import schema      | Safe |
| 1.20 | constant | `CoreDocs` `src/state-files/herdr-core.ts:10`             | `HerdrCoreDocsFile`      | Import schema      | Safe |
| 1.21 | constant | `CoreTerminals` `src/state-files/herdr-core.ts:43`        | `HerdrCoreTerminalsFile` | Import schema      | Safe |
| 1.22 | constant | `CliCheck` `src/state-files/machine-state.ts:11`          | `CliCheckFile`           | Import schema      | Safe |
| 1.23 | constant | `CodexSandbox` `src/state-files/machine-state.ts:26`      | `CodexSandboxFile`       | Import schema      | Safe |
| 1.24 | constant | `MigrateJournal` `src/state-files/machine-state.ts:66`    | `MigrateFile`            | Import schema      | Safe |
| 1.25 | constant | `LayoutNumber` `src/state-files/machine-state.ts:94`      | `LayoutFile`             | Import schema      | Safe |
| 1.26 | constant | `ServiceRecord` `src/state-files/service-state.ts:7`      | `ServiceFile`            | Import schema      | Safe |
| 1.27 | constant | `WebState` `src/state-files/service-state.ts:15`          | `WebFile`                | Import schema      | Safe |
| 1.28 | constant | `SentMessages` `src/state-files/service-state.ts:48`      | `SentFile`               | Import schema      | Safe |
| 1.29 | constant | `UsageEvent` `src/state-files/service-state.ts:62`        | `UsageLine`              | Import schema      | Safe |
| 1.30 | constant | `Settings` `src/state-files/settings.ts:92`               | `SettingsFile`           | Settings file      | Safe |
| 1.31 | constant | `ModelPicks` `src/state-files/settings.ts:130`            | `ModelPicksFile`         | Import schema      | Safe |
| 1.32 | constant | `TaskAgent` `src/state-files/task-list.ts:14`             | `AgentRow`               | Agent row          | Safe |
| 1.33 | constant | `MainWatch` `src/state-files/task-list.ts:352`            | `DestinationWatch`       | Destination watch  | Safe |
| 1.34 | constant | `TaskList` `src/state-files/task-list.ts:380`             | `TaskListFile`           | Import schema      | Safe |

### Batch 2: state file registry words

Done in 3dbacc7. Row 2.6 done in cb9cc9b.

Ready: now, after batch 1 (both change the imports at the top of
`src/state-files/registry.ts`). Files: `src/state-files/registry.ts`,
`src/state-files/round-trip.ts`, `src/state-files/journals.ts`,
`tests/state-files.test.ts`, `tests/state-check.test.ts`,
`tests/state-file-fixtures.ts`.

Tests: `bun test tests/state-files.test.ts tests/state-check.test.ts`.
Gone: `rg -n -w 'Owner|owners|StateFile|CORE|LAUNCH|OPERATION|AZURE|journals' src/state-files tests/state-files.test.ts tests/state-check.test.ts tests/state-file-fixtures.ts`.

| #    | Kind     | Current name (path:line)                                                                                                           | Proposed name                 | Glossary term     | Risk                                                                                                                                                                                          |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | type     | `Owner` `src/state-files/registry.ts:34`, used at `:70`                                                                            | `Writer`                      | State file writer | Safe                                                                                                                                                                                          |
| 2.2  | property | `owners` `src/state-files/registry.ts:70`, and the `owners:` key of all 28 entries (lines 110 to 331)                              | `writers`                     | State file writer | Safe: nothing outside `registry.ts` reads it                                                                                                                                                  |
| 2.3  | type     | `StateFile` `src/state-files/registry.ts:63`, used at `:104`, `:337` and `src/state-files/round-trip.ts:9`, `:138`, `:177`, `:223` | `StateFileEntry`              | State file entry  | Safe                                                                                                                                                                                          |
| 2.4  | constant | `CORE` `src/state-files/registry.ts:79`, used at `:320`, `:328`                                                                    | `HERDR_CORE`                  | herdr-core link   | Safe                                                                                                                                                                                          |
| 2.5  | file     | `src/state-files/journals.ts`, imported at `src/state-files/registry.ts:17`                                                        | `src/state-files/attempts.ts` | State file family | Safe: use `git mv`                                                                                                                                                                            |
| 2.6  | constant | value `"journals"` in type `Family` `src/state-files/registry.ts:56`, and `family: "journals"` at `:106`, `:114`                   | value `"attempts"`            | State file family | Needs care: it is output (state check's `data.families` and its message), and two tests assert it: `tests/state-files.test.ts:41` and `tests/state-check.test.ts:69`. Change both in this row |
| 2.7  | constant | `CORE` `tests/state-files.test.ts:9`                                                                                               | `HERDR_CORE`                  | herdr-core link   | Safe                                                                                                                                                                                          |
| 2.8  | constant | `CORE` `tests/state-file-fixtures.ts:6`, used at `:848`, `:857`                                                                    | `HERDR_CORE`                  | herdr-core link   | Safe                                                                                                                                                                                          |
| 2.9  | constant | `LAUNCH` `tests/state-file-fixtures.ts:9`, used at `:60`, `:337`, `:338`, `:401`                                                   | `LAUNCH_ID`                   | Launch id         | Safe                                                                                                                                                                                          |
| 2.10 | constant | `OPERATION` `tests/state-file-fixtures.ts:10`, used at `:430`, `:434`, `:449`                                                      | `ATTEMPT_ID`                  | Attempt id        | Safe                                                                                                                                                                                          |
| 2.11 | constant | `AZURE` `tests/state-file-fixtures.ts:11`, used at `:63`, `:361`                                                                   | `AZURE_BINDING`               | Recorded binding  | Safe                                                                                                                                                                                          |

### Batch 3: command entry words

Done in a4a8f5d.

Ready: now. Files: `src/cli.ts`, `src/commands-contract.ts` (neither is in
the inventory worker's change).

Tests: `bun test tests/cli.test.ts tests/state-check.test.ts`.
Gone: `rg -n -w 'COMMANDS|formatOperation|operation' src/cli.ts` and
`rg -n 'const outcome' src/commands-contract.ts`.

| #   | Kind     | Current name (path:line)                                                  | Proposed name       | Glossary term                 | Risk                                         |
| --- | -------- | ------------------------------------------------------------------------- | ------------------- | ----------------------------- | -------------------------------------------- |
| 3.1 | constant | `COMMANDS` `src/cli.ts:12`, used at `:14`, `:190`, `:344`, `:368`, `:392` | `COMMAND_SUMMARIES` | Command table                 | Safe                                         |
| 3.2 | function | `formatOperation` `src/cli.ts:486`, called at `:520`                      | `formatResult`      | Result (CLI kernel)           | Safe                                         |
| 3.3 | variable | `result` `src/cli.ts:511`, used at `:520`                                 | `envelope`          | Envelope (CLI kernel)         | Safe. Do it before 3.4, which frees `result` |
| 3.4 | variable | `operation` `src/cli.ts:501`, used at `:503`, `:510`, `:541`              | `result`            | Result (CLI kernel)           | Safe after 3.3                               |
| 3.5 | variable | `outcome` `src/commands-contract.ts:86`, used at `:111`                   | `stationFields`     | Station (CLI kernel); rule T3 | Safe                                         |

### Batch 4: the command result type

Done in 2a8f327.

Ready: wait until the inventory work is committed
(`src/domains/inventory/commands.ts` and `tests/cli.test.ts` use these names).
Files: `src/commands-contract.ts`, `src/cli.ts`, `src/domains/state-check.ts`,
`src/domains/result.ts`, `src/domains/inventory/commands.ts`,
`tests/cli.test.ts`.

Tests: `bun test`.
Gone: `rg -n 'OperationResult|operationPreload|"operation.ts"' src tests`.

| #   | Kind     | Current name (path:line)                                                                                                                                             | Proposed name                        | Glossary term       | Risk                                                   |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------- | ------------------------------------------------------ |
| 4.1 | type     | `OperationResult` `src/commands-contract.ts:5`, every use (`src/cli.ts`, `src/domains/state-check.ts`, `src/domains/result.ts`, `src/domains/inventory/commands.ts`) | `CommandResult`                      | Result (CLI kernel) | Safe, but it crosses into the inventory worker's files |
| 4.2 | function | `operationPreload` `tests/cli.test.ts:388`, and its preload file name value `"operation.ts"` at `:393`                                                               | `resultPreload`, value `"result.ts"` | Result (CLI kernel) | Safe                                                   |

### Batch 5: leave the domain core

Done in a56851d. Row 5.1 done in 2088af3.

Ready: wait until the inventory work is committed (row 5.1 changes
`src/commands.ts`), and after batch 4. Files: `src/domains/state-check.ts`,
`src/domains/result.ts`, `src/domains/status.ts`, `src/domains/template.ts`,
`src/commands.ts`, `eslint.config.mjs`. Rule: F4, F6.

Tests: `bun test tests/state-check.test.ts tests/cli.test.ts`.
Gone: `test ! -e src/domains/state-check.ts && test ! -e src/domains/result.ts`,
`rg -n -w IDENTITY src/state-files` and
`rg -n '\bstatus\(' src/command-result.ts src/domains`.

| #   | Kind              | Current name (path:line)                                                                             | Proposed name                 | Glossary term                 | Risk                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | file              | `src/domains/state-check.ts`, imported at `src/commands.ts:29`                                       | `src/state-files/handlers.ts` | Command handler               | Needs care: change its imports to `./registry.ts` and `./round-trip.ts`, and the dynamic import in `src/commands.ts`. `eslint.config.mjs` applies `repository/no-domain-output` only to `src/domains/**/*.ts`: add `src/state-files/**/*.ts` to that `files` list in the same commit, or the rule stops covering this file |
| 5.2 | constant          | `IDENTITY` `src/domains/state-check.ts:8`, used at `:22`                                             | `COMMAND_IDENTITY`            | Command identity (CLI kernel) | Safe                                                                                                                                                                                                                                                                                                                       |
| 5.3 | file              | `src/domains/result.ts`, imported at `src/domains/status.ts:1`, `src/domains/template.ts:1`          | `src/command-result.ts`       | Result (CLI kernel)           | Safe: use `git mv`. If the owner removes the template's example commands first (see "Not renames"), delete this file instead                                                                                                                                                                                               |
| 5.4 | exported function | `status` `src/domains/result.ts:3`, called at `src/domains/status.ts:3`, `src/domains/template.ts:3` | `unchangedSuccess`            | Outcome (CLI kernel)          | Safe                                                                                                                                                                                                                                                                                                                       |

### Batch 6: the interface inventory

Done in 5c60c7c. Row 6.1 done in c039068, row 6.2 in c61d583, row 6.3 in aef3a34, row 6.4 in 33f9f4e, row 6.11 in 74e7fda and row 6.7 in 26bae2f.

Ready: wait until the inventory work is committed. Find each name again with
`rg -n -w '<name>' src tests` before you change it.
Files: everything under `src/domains/inventory/`, `tests/inventory*.ts`,
`src/commands.ts`, `eslint.config.mjs`, and the kept file
`inventory/core-rpc-methods.json`.

Tests: `bun test tests/inventory.test.ts tests/inventory-extractors.test.ts tests/cli.test.ts`.
Gone: `test ! -e src/domains/inventory` and
`rg -n -w 'CoreRpcMethod|coreRpcMethods|settle|forkOption|forkFiles' src tests`.

| #    | Kind              | Current name (path:line)                                                                                                            | Proposed name                                                                         | Glossary term                 | Risk                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | folder            | `src/domains/inventory/`                                                                                                            | `src/inventory/`                                                                      | Interface inventory           | Needs care: `git mv` the folder; change `../../` imports inside it to `../`, the two dynamic imports in `src/commands.ts`, and every `../src/domains/inventory/` import in `tests/`. Add `src/inventory/**/*.ts` to the `repository/no-domain-output` files in `eslint.config.mjs`                             |
| 6.2  | file              | `src/domains/inventory/commands.ts`                                                                                                 | `src/inventory/handlers.ts`                                                           | Command handler               | Safe after 6.1; change the two dynamic imports in `src/commands.ts`                                                                                                                                                                                                                                            |
| 6.3  | file              | `src/domains/inventory/fork.ts`                                                                                                     | `src/inventory/fork-checkout.ts`                                                      | Fork checkout                 | Safe; change its import in `handlers.ts`                                                                                                                                                                                                                                                                       |
| 6.4  | file              | `src/domains/inventory/core-rpc-methods.ts`                                                                                         | `src/inventory/herdr-core-rpc-methods.ts`                                             | herdr-core link               | Safe; change its imports in `lists.ts` and `tests/inventory-extractors.test.ts`                                                                                                                                                                                                                                |
| 6.5  | type              | `CoreRpcMethod` (constant and type) `core-rpc-methods.ts:12`, `:19`; used in `lists.ts:2`, `:70`                                    | `HerdrCoreRpcMethod`                                                                  | herdr-core link               | Safe                                                                                                                                                                                                                                                                                                           |
| 6.6  | exported function | `coreRpcMethods` `core-rpc-methods.ts:45`; used in `lists.ts:2`, `:71` and `tests/inventory-extractors.test.ts`                     | `herdrCoreRpcMethods`                                                                 | herdr-core link               | Safe                                                                                                                                                                                                                                                                                                           |
| 6.7  | constant          | value: list name `"core-rpc-methods"` `lists.ts:69`, and item kind `"core-rpc-method"` `core-rpc-methods.ts:13`, `:60`              | values `"herdr-core-rpc-methods"` and `"herdr-core-rpc-method"`                       | herdr-core link               | Needs care: it renames the kept file `inventory/core-rpc-methods.json` and the `kind` of every item in it. `git mv` the kept file, run `bun run start inventory extract --fork <fork checkout>`, and change the tests that name either value (`tests/inventory.test.ts`, `tests/inventory-extractors.test.ts`) |
| 6.8  | property          | `core` of `Sources` `lists.ts:18`; used in `lists.ts:81`, `:82`, `fork.ts:37`, `:48` and `sources` in `tests/inventory-fixtures.ts` | `coreFolder`                                                                          | Old system                    | Safe                                                                                                                                                                                                                                                                                                           |
| 6.9  | function          | `settle` `commands.ts:48`; called at `:274`, `:469`                                                                                 | `resultOf`                                                                            | Closure (CLI kernel); rule V3 | Safe                                                                                                                                                                                                                                                                                                           |
| 6.10 | function          | `forkOption` `commands.ts:120`; called at `:263`, `:457`                                                                            | `forkCheckoutOption`                                                                  | Fork checkout                 | Safe; the option word `--fork` stays                                                                                                                                                                                                                                                                           |
| 6.11 | variable          | every local and parameter named `fork` in `commands.ts` and `fork.ts` (`sourcesIn`, `readSources`)                                  | `forkCheckout`                                                                        | Fork checkout                 | Needs care: `commands.ts:429` writes the key `fork` into the check command's result data. Keep that key and rename only the variable: `fork: forkCheckout ?? null`                                                                                                                                             |
| 6.12 | constant          | `forkFiles` `tests/inventory-fixtures.ts:218`; used in `tests/inventory.test.ts`                                                    | `forkCheckoutFiles`                                                                   | Fork checkout                 | Safe                                                                                                                                                                                                                                                                                                           |
| 6.13 | test name         | `"core RPC methods: the required list and every call by name, marked for each"` `tests/inventory-extractors.test.ts:109`            | `"herdr-core RPC methods: the required list and every call by name, marked for each"` | herdr-core link               | Safe                                                                                                                                                                                                                                                                                                           |

### Batch 7: command identity prefix and program name

Done in a71f114.

Ready: wait until the inventory work is committed, and after batches 4 to 6.
This batch changes output, so it goes last. Files: `src/commands.ts`,
`src/commands-contract.ts`, `src/cli.ts`, `src/state-files/handlers.ts`,
`src/inventory/handlers.ts`, `src/domains/status.ts`,
`src/domains/template.ts`, `tests/cli.test.ts`, `tests/state-check.test.ts`,
`tests/inventory.test.ts`.

Tests: `bun test`.
Gone: `rg -n 'example\.(status|template|state|inventory|dispatch|help|discovery|command-discovery)|\bexample (COMMAND|--help|status)|example CLI' src tests`.

| #   | Kind     | Current name (path:line)                                                                                                                                                                                                                                                                                                                                                                                      | Proposed name       | Glossary term                 | Risk                                                                                                                                                                       |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | constant | value: the command identity prefix `example.` in `src/commands.ts:5`, `:13`, `:23`, `:34`, `:45`; `src/commands-contract.ts:53`, `:59`, `:65`, `:71`, `:87`; `src/cli.ts:58`, `:112`, `:128`, `:143`, `:318`, `:339`, `:342`, `:364`, `:366`, `:396`, `:399`; `src/domains/state-check.ts:8`; `src/domains/status.ts:3`; `src/domains/template.ts:4`; the inventory handlers; and every test that asserts one | prefix `shepherdr.` | Command identity (CLI kernel) | Needs care: every command's JSON output changes, and the tests assert identities in many places, some inside preload source strings. Change source and tests in one commit |
| 7.2 | constant | value: the program name `example` in human text, `src/cli.ts:64`, `:95`, `:134`, `:149`, `:352`, `:353`, `:358`, `:548` and `src/commands-contract.ts:94`, and the tests that assert that text                                                                                                                                                                                                                | `shepherdr`         | Program                       | Needs care: `src/cli.ts:95` is a string literal type, which must change together with the value it types; the help test asserts the usage line                             |

### Batch 8: command line test titles

Done in 8cab896.

Ready: wait until the inventory work is committed (`tests/cli.test.ts` is in
that change). File: `tests/cli.test.ts`. Rule: S2.

Tests: `bun test tests/cli.test.ts`.
Gone: `rg -n 'test\(.(machine status|.*before dispatch)' tests/cli.test.ts`.

| #   | Kind      | Current name (path:line)                                                                 | Proposed name                                                                        | Glossary term                           | Risk |
| --- | --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ---- |
| 8.1 | test name | `"machine status emits one 2.0 envelope and no stderr"` `tests/cli.test.ts:185`          | `"JSON status emits one 2.0 envelope and no stderr"`                                 | Machine (a computer here)               | Safe |
| 8.2 | test name | `"machine status emits a strict internal fallback after serialization fails"` `:202`     | `"JSON status emits a strict internal fallback after serialization fails"`           | Machine                                 | Safe |
| 8.3 | test name | `"machine status emits a distinct internal fallback after stdout emission fails"` `:282` | `"JSON status emits a distinct internal fallback after stdout emission fails"`       | Machine                                 | Safe |
| 8.4 | test name | `"machine status reports repair guidance after a real stdout reader closes"` `:310`      | `"JSON status reports repair guidance after a real stdout reader closes"`            | Machine                                 | Safe |
| 8.5 | test name | `` `builtin stdout errors are handled before dispatch: ${identity}` `` `:574`            | `` `a builtin's stdout error ends the run with exit 1 and no output: ${identity}` `` | Dispatch and handler entry (CLI kernel) | Safe |

## Totals

76 rows: 47 constants (43 names and 4 string values), 6 files, 4 types,
4 variables, 4 functions, 2 exported functions, 2 properties, 1 folder and
6 test names. 69 are safe mechanical renames; 7 need care (2.6, 5.1, 6.1,
6.7, 6.11, 7.1, 7.2). Batches 1 to 3 (50 rows) are ready now; batches 4 to 8
(26 rows) wait until the inventory work is committed.

## Names already right

Counted, not listed. Local variables were read and are counted only where
they disagree.

- Committed code outside the inventory: 183 of 234 top-level declarations
  (48 are renamed here and 3 are left to the owner), 16 of 23 files, both folders (`src/domains/`, `src/state-files/`) and 26 of
  32 test titles. `src/domains/` keeps its name; its meaning narrows to the
  domain core.
- The inventory files: about 175 of about 180 top-level declarations, 13 of
  16 files and 19 of 20 test titles.

## Not renames: the owner's decision

Removed in dfb424c.

These names disagree with the glossary, but the fix is to remove them, not to
rename them. They are the template starter's examples.

- `src/index.ts` (`greet`) and `src/index.test.ts`: a placeholder, and a test
  outside `tests/` (rule S1). `index.ts` is kept for a folder's interface.
- `src/domains/status.ts` (`inspectStatus`, route `status`, identity
  `example.status`): its route `status` is the word of the agent-facing
  `herdr-task status` command. The fallback tests in `tests/cli.test.ts` run
  `status`, so they need another subject first.
- `src/domains/template.ts` (`inspectTemplate`, route `template info`): an
  example of the template's own convention.
