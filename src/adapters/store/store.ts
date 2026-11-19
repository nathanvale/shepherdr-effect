import {
  Context,
  Data,
  Effect,
  Layer,
  PubSub,
  Ref,
  Result,
  Schema,
  Stream,
} from "effect";
import { NotBuilt, notBuilt } from "../not-built.ts";

export interface StoreTable<Row> {
  readonly name: string;
  readonly row: Schema.Codec<Row, unknown>;
}

export interface StoreReader {
  readonly get: <Row>(table: StoreTable<Row>, key: string) => Row | undefined;
  readonly list: <Row>(table: StoreTable<Row>) => ReadonlyArray<Row>;
}

export interface StoreTransaction extends StoreReader {
  readonly put: <Row>(table: StoreTable<Row>, key: string, row: Row) => void;
  readonly remove: <Row>(table: StoreTable<Row>, key: string) => void;
}

interface StoreChange {
  readonly table: string;
  readonly key: string;
  readonly change: "put" | "removed";
}

class StoreBusy extends Data.TaggedError("StoreBusy")<{
  readonly recorded: "nothing";
}> {}

class StoreUnreadable extends Data.TaggedError("StoreUnreadable")<{
  readonly reason: string;
}> {}

interface StoreShape {
  readonly transact: <A, E>(
    change: (transaction: StoreTransaction) => Result.Result<A, E>,
  ) => Effect.Effect<A, E | StoreBusy | StoreUnreadable | NotBuilt>;
  readonly read: <A>(
    query: (reader: StoreReader) => A,
  ) => Effect.Effect<A, StoreUnreadable | NotBuilt>;
  readonly changes: Stream.Stream<StoreChange, StoreUnreadable | NotBuilt>;
}

type Rows = ReadonlyMap<string, string>;
type Tables = ReadonlyMap<string, Rows>;

function rowText<Row>(table: StoreTable<Row>, row: Row): string {
  return Schema.encodeSync(Schema.fromJsonString(table.row))(row);
}

function rowOf<Row>(table: StoreTable<Row>, key: string, text: string): Row {
  const row = Schema.decodeUnknownResult(Schema.fromJsonString(table.row))(
    text,
  );
  if (Result.isSuccess(row)) return row.success;
  throw new StoreUnreadable({
    reason: `The row "${key}" of the table "${table.name}" does not decode.`,
  });
}

function refusingUnreadable<A>(
  reading: () => A,
): Result.Result<A, StoreUnreadable> {
  try {
    return Result.succeed(reading());
  } catch (error) {
    if (error instanceof StoreUnreadable) return Result.fail(error);
    throw error;
  }
}

function readerOver(tables: () => Tables): StoreReader {
  return {
    get: (table, key) => {
      const text = tables().get(table.name)?.get(key);
      return text === undefined ? undefined : rowOf(table, key, text);
    },
    list: (table) =>
      [...(tables().get(table.name) ?? [])]
        .sort(([one], [other]) => (one < other ? -1 : one > other ? 1 : 0))
        .map(([key, text]) => rowOf(table, key, text)),
  };
}

interface Draft {
  readonly transaction: StoreTransaction;
  readonly tables: () => Tables;
  readonly changes: () => ReadonlyArray<StoreChange>;
  readonly close: () => void;
}

function draftOf(committed: Tables): Draft {
  const tables = new Map(committed);
  const changes: StoreChange[] = [];
  const state = { open: true };
  const rowsToChange = (name: string): Map<string, string> => {
    if (!state.open)
      throw new Error("A store transaction was used after transact returned.");
    const rows = new Map(tables.get(name));
    tables.set(name, rows);
    return rows;
  };
  return {
    transaction: {
      ...readerOver(() => tables),
      put: (table, key, row) => {
        rowsToChange(table.name).set(key, rowText(table, row));
        changes.push({ table: table.name, key, change: "put" });
      },
      remove: (table, key) => {
        if (rowsToChange(table.name).delete(key))
          changes.push({ table: table.name, key, change: "removed" });
      },
    },
    tables: () => tables,
    changes: () => changes,
    close: () => {
      state.open = false;
    },
  };
}

interface Committing<A, E> {
  readonly result: Result.Result<A, E | StoreUnreadable>;
  readonly changes: ReadonlyArray<StoreChange>;
}

function committing<A, E>(
  change: (transaction: StoreTransaction) => Result.Result<A, E>,
): (tables: Tables) => readonly [Committing<A, E>, Tables] {
  return (tables) => {
    const draft = draftOf(tables);
    const read = refusingUnreadable(() => change(draft.transaction));
    draft.close();
    if (Result.isFailure(read))
      return [{ result: Result.fail(read.failure), changes: [] }, tables];
    return Result.isSuccess(read.success)
      ? [{ result: read.success, changes: draft.changes() }, draft.tables()]
      : [{ result: read.success, changes: [] }, tables];
  };
}

export interface StoreTestScript {
  readonly rowTexts?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  readonly writerElsewhere?: boolean;
}

function tablesOf(rowTexts: StoreTestScript["rowTexts"]): Tables {
  return new Map(
    Object.entries(rowTexts ?? {}).map(([name, rows]) => [
      name,
      new Map(Object.entries(rows)),
    ]),
  );
}

export class Store extends Context.Service<Store, StoreShape>()("Store") {
  static readonly layer = Layer.succeed(Store, {
    transact: () => notBuilt("Store", "transact"),
    read: () => notBuilt("Store", "read"),
    changes: Stream.fail(new NotBuilt({ seam: "Store", entry: "changes" })),
  });

  static layerTestWith(script: StoreTestScript): Layer.Layer<Store> {
    return Layer.effect(
      Store,
      Effect.gen(function* () {
        const committed = yield* Ref.make(tablesOf(script.rowTexts));
        const published = yield* PubSub.unbounded<StoreChange>();
        return {
          transact: (change) =>
            script.writerElsewhere === true
              ? Effect.fail(new StoreBusy({ recorded: "nothing" }))
              : Ref.modify(committed, committing(change)).pipe(
                  Effect.tap(({ changes }) =>
                    PubSub.publishAll(published, changes),
                  ),
                  Effect.flatMap(({ result }) => Effect.fromResult(result)),
                ),
          read: (query) =>
            Ref.get(committed).pipe(
              Effect.flatMap((tables) =>
                Effect.fromResult(
                  refusingUnreadable(() => query(readerOver(() => tables))),
                ),
              ),
            ),
          changes: Stream.fromPubSub(published),
        };
      }),
    );
  }

  static readonly layerTest = Store.layerTestWith({});
}
