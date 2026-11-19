# Rename batches 1 to 4

Part of the [rename plan](rename-plan.md), which holds how to carry out a
batch, the naming rules and the kinds. Batches 5 to 8 are in
[rename-batches-5-to-8.md](rename-batches-5-to-8.md).

## Batch 1: import schema names

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

## Batch 2: state file registry words

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

## Batch 3: command entry words

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

## Batch 4: the command result type

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
