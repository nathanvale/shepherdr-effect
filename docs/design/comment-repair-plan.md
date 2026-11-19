# Comment repair plan

`repository/no-comments` refuses 269 comments in 33 files. Each is recorded in
`eslint-suppressions.json`, so lint is green while they stand. Repair them in
the five batches below until that file holds no entry.

Counts were taken at `675ebb5`. Take them again before you start.

## One batch

1. Show the batch's findings:

   ```sh
   echo '{}' > "${TMPDIR:-/tmp}/no-suppressions.json"
   node_modules/.bin/eslint \
     --suppressions-location "${TMPDIR:-/tmp}/no-suppressions.json" <the batch's files>
   ```

2. Repair every finding by the first repair rule that fits. Keep behaviour the
   same: a comment repair changes names, types, titles and annotations only.
3. Remove the batch's entries: `node_modules/.bin/eslint . --prune-suppressions`.
   `git diff eslint-suppressions.json` then shows the batch's files gone and no
   other line changed.
4. Run `bun run format`, then the done check.
5. Commit the batch's files and `eslint-suppressions.json` with a pathspec.

Batches share `eslint-suppressions.json`, so run one batch at a time.

## Done check

A batch is done when all five hold:

- the command in step 1 prints nothing for the batch's files;
- `eslint-suppressions.json` names none of the batch's files;
- `bun run check` exits 0;
- `bun run --silent start state check --dir "$HOME/.local/state/shepherdr-effect-design/pilot-state-20261119" >/dev/null; echo $?`
  prints `0` (send its output to `/dev/null`: the pilot's values stay private);
- `bun run --silent start inventory check --fork /Users/nathanvale/code/herdr-projects >/dev/null; echo $?`
  prints `0`.

## Repair rules

Every comment says something. Move what it says to the first place below that
can hold it, then delete the comment. A comment whose reasoning has no new
home yet is not repaired.

### 1. A Schema annotation

For a comment on a schema or one of its fields. Use `annotate` on a schema and
`annotateKey` on a field. Keep each on-disk key as it is.

```ts
/** Milliseconds since the epoch, as the old code's `now()` writes them. */
export const Millis = Schema.Int;
```

```ts
export const Millis = Schema.Int.annotate({
  description:
    "Milliseconds since the epoch, as the old code's now() writes them.",
});
```

```ts
  // In the pilot's file. No reader or writer at 9859c344 names it.
  credential_delivery: optional(Schema.String),
```

```ts
  credential_delivery: optional(Schema.String).annotateKey({
    description:
      "In the pilot's file. No reader or writer at 9859c344 names it.",
  }),
```

### 2. A name

For a comment that says what a value or function is. Use the glossary's words
([domain.md](../agents/domain.md)).

```ts
// A file can break its schema in every record it holds: a few places say enough.
const SHOWN = 8;
```

```ts
const BROKEN_PLACES_SHOWN_PER_FILE = 8;
```

### 3. A type

For a comment that says what a field or parameter holds.

```ts
  /** For a bracket's index, the index of the bracket that closes or opens it. */
  readonly pair: ReadonlyMap<number, number>;
```

```ts
type BracketIndex = number;

  readonly partnerOf: ReadonlyMap<BracketIndex, BracketIndex>;
```

### 4. A test title

For a comment inside a test that says why a case is there. Give the case its
own test, or its own named value, and let the title say it.

```ts
    // Acted on before argparse runs, so nothing registers it.
    command("_job", '["_job"]', true),
```

```ts
test("herdr-task commands: a command acted on before argparse runs is listed as hidden", () => {
  expect(herdrTaskCommands(file(CLI))).toContainEqual(
    command("_job", '["_job"]', true),
  );
});
```

### 5. A line in a design note

For reasoning that no name, type, title or annotation can carry: why a choice
was made, or a fact about the old system that spans files. Add it to
[grounding.md](grounding.md) for a fact about the old system or the pilot, and
to [synthesis.md](synthesis.md) for a reason behind this design. Both must
stay under 5,000 tokens: `bun run check:file-size` says so.

### 6. A sanctioned marker, only where it is true

`Platform:` states behaviour of a runtime, an operating system or a tool that
this repository cannot change. `Interface:` states a public contract that the
types cannot state. The marker is the comment's first word. The old system's
file formats are data this repository reads, so they take rule 1.

```ts
    // The parser's own message can quote the text, so it is not passed on.
    return undefined;
```

```ts
    // Platform: JSON.parse's message can quote the text, so it is not passed on.
    return undefined;
```

```ts
/** One file of the old system, read as text. `path` is from the fork root, with `/` between its parts. */
export interface SourceFile {
```

```ts
// Interface: `path` is from the fork root, with `/` between its parts.
export interface SourceFile {
```

## Batches

A rename may touch a line in another batch's file that uses the name. That
line belongs to your commit.

| Batch | Folder                                   | Files and counts                                                                                                                                                                                              | Count |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1     | `src/state-files`, task engine schemas   | `shared.ts` 7, `task-list.ts` 17, `attempts.ts` 12, `engine-state.ts` 22                                                                                                                                      | 58    |
| 2     | `src/state-files`, the rest              | `settings.ts` 11, `service-state.ts` 6, `machine-state.ts` 7, `herdr-core.ts` 7, `registry.ts` 10, `round-trip.ts` 11, `handlers.ts` 4                                                                        | 56    |
| 3     | `src/inventory`, the list extractors     | `herdr-task-commands.ts` 19, `service-routes.ts` 13, `hc-cli-subcommands.ts` 11, `service-actions.ts` 7, `herdr-core-rpc-methods.ts` 5, `terminal-labels.ts` 4, `diagram-elements.ts` 3                       | 62    |
| 4     | `src/inventory`, shared files, and `src` | `tokens.ts` 18, `handlers.ts` 18, `lists.ts` 8, `source.ts` 8, `fork-checkout.ts` 4, `state-files.ts` 1, `src/commands-contract.ts` 1                                                                         | 58    |
| 5     | `tests`                                  | `inventory-extractors.test.ts` 15, `inventory-fixtures.ts` 6, `inventory.test.ts` 6, `state-file-fixtures.ts` 3, `state-files.test.ts` 2, `cli.test.ts` 1, `state-check.test.ts` 1, `task-list-fixtures.ts` 1 | 35    |

Each batch removes one suppression entry per file it lists: that file's
`repository/no-comments` count. Batch 5 changes tests, so write a lightweight
test design brief first: the assertions stay, and only titles and case
grouping change.
