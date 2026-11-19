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

The batches are in two files, each under the file size limit:

- [Batches 1 to 4](rename-batches-1-to-4.md): import schema names, state file
  registry words, command entry words, the command result type.
- [Batches 5 to 8](rename-batches-5-to-8.md): leave the domain core, the
  interface inventory, command identity prefix and program name, command line
  test titles.

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
