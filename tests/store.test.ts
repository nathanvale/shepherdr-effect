import { expect, test } from "bun:test";
import { Effect, Fiber, Result, Schema, Stream } from "effect";
import {
  Store,
  type StoreTable,
  type StoreTestScript,
  type StoreTransaction,
} from "../src/adapters/store/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const counters: StoreTable<{ readonly count: number }> = {
  name: "counters",
  row: Schema.Struct({ count: Schema.Int }),
};

const names: StoreTable<{ readonly name: string }> = {
  name: "names",
  row: Schema.Struct({ name: Schema.String }),
};

function onTestStore<A, E>(
  program: Effect.Effect<A, E, Store>,
  script?: StoreTestScript,
): Promise<A> {
  const layer =
    script === undefined ? Store.layerTest : Store.layerTestWith(script);
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

function onRealStore<A, E>(program: Effect.Effect<A, E, Store>): Promise<E> {
  return Effect.runPromise(
    Effect.flip(program).pipe(Effect.provide(Store.layer)),
  );
}

test("a read sees what a committed store transaction put", async () => {
  const seen = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      const answer = yield* store.transact((transaction) => {
        transaction.put(counters, "starts", { count: 3 });
        return Result.succeed("recorded");
      });
      const row = yield* store.read((reader) => reader.get(counters, "starts"));
      const missing = yield* store.read((reader) =>
        reader.get(counters, "stops"),
      );
      return { answer, row, missing };
    }),
  );

  expect(seen).toEqual({
    answer: "recorded",
    row: { count: 3 },
    missing: undefined,
  });
});

test("a refused store transaction fails with its refusal and records nothing it put", async () => {
  const seen = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      yield* store.transact((transaction) => {
        transaction.put(counters, "starts", { count: 1 });
        return Result.succeed(undefined);
      });
      const refusal = yield* Effect.flip(
        store.transact((transaction) => {
          transaction.put(counters, "starts", { count: 99 });
          transaction.put(names, "first", { name: "written then refused" });
          transaction.remove(counters, "starts");
          return Result.fail("refused after writing");
        }),
      );
      const rows = yield* store.read((reader) => ({
        counters: reader.list(counters),
        names: reader.list(names),
      }));
      return { refusal, rows };
    }),
  );

  expect(seen).toEqual({
    refusal: "refused after writing",
    rows: { counters: [{ count: 1 }], names: [] },
  });
});

test("fifty store transactions at once each see the one before: no count is lost", async () => {
  const count = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      const addOne = store.transact((transaction) => {
        const before = transaction.get(counters, "starts")?.count ?? 0;
        transaction.put(counters, "starts", { count: before + 1 });
        return Result.succeed(undefined);
      });
      yield* Effect.all(
        Array.from({ length: 50 }, () => addOne),
        { concurrency: "unbounded" },
      );
      return yield* store.read(
        (reader) => reader.get(counters, "starts")?.count,
      );
    }),
  );

  expect(count).toBe(50);
});

test("a store transaction reads its own writes, and a list comes back in key order", async () => {
  const seen = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      const inside = yield* store.transact((transaction) => {
        transaction.put(names, "b", { name: "second" });
        transaction.put(names, "c", { name: "third" });
        transaction.put(names, "a", { name: "first" });
        transaction.remove(names, "c");
        return Result.succeed(transaction.list(names));
      });
      const after = yield* store.read((reader) => reader.list(names));
      return { inside, after };
    }),
  );

  const expected = [{ name: "first" }, { name: "second" }];
  expect(seen).toEqual({ inside: expected, after: expected });
});

test("changes tells each committed change in order and nothing of a refused store transaction", async () => {
  const told = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      const listening = yield* store.changes.pipe(
        Stream.take(3),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      );
      yield* store.transact((transaction) => {
        transaction.put(names, "a", { name: "first" });
        transaction.put(counters, "starts", { count: 1 });
        return Result.succeed(undefined);
      });
      yield* Effect.flip(
        store.transact((transaction) => {
          transaction.put(names, "refused", { name: "never told" });
          return Result.fail("refused");
        }),
      );
      yield* store.transact((transaction) => {
        transaction.remove(names, "a");
        transaction.remove(names, "never there");
        return Result.succeed(undefined);
      });
      return yield* Fiber.join(listening);
    }),
  );

  expect(told).toEqual([
    { table: "names", key: "a", change: "put" },
    { table: "counters", key: "starts", change: "put" },
    { table: "names", key: "a", change: "removed" },
  ]);
});

test("a store transaction kept after transact returned cannot change the store", async () => {
  const kept: StoreTransaction[] = [];
  const seen = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      yield* store.transact((transaction) => {
        kept.push(transaction);
        transaction.put(counters, "starts", { count: 1 });
        return Result.succeed(undefined);
      });
      const late = kept[0];
      const thrown: unknown[] = [];
      try {
        late?.put(counters, "starts", { count: 2 });
      } catch (error) {
        thrown.push(error);
      }
      try {
        late?.remove(counters, "starts");
      } catch (error) {
        thrown.push(error);
      }
      const row = yield* store.read((reader) => reader.get(counters, "starts"));
      return { row, thrown: thrown.map(String) };
    }),
  );

  expect(seen).toEqual({
    row: { count: 1 },
    thrown: [
      "Error: A store transaction was used after transact returned.",
      "Error: A store transaction was used after transact returned.",
    ],
  });
});

const unreadable = {
  _tag: "StoreUnreadable",
  reason: 'The row "starts" of the table "counters" does not decode.',
};

test("a row that does not decode refuses the read and the store transaction, and is never read as missing", async () => {
  const seen = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      const read = yield* Effect.flip(
        store.read((reader) => reader.get(counters, "starts")),
      );
      const listed = yield* Effect.flip(
        store.read((reader) => reader.list(counters)),
      );
      const transacted = yield* Effect.flip(
        store.transact((transaction) => {
          transaction.put(names, "a", { name: "written before the read" });
          return Result.succeed(transaction.get(counters, "starts"));
        }),
      );
      const names_ = yield* store.read((reader) => reader.list(names));
      return {
        failures: [read, listed, transacted].map(failureOf),
        names: names_,
      };
    }),
    { rowTexts: { counters: { starts: '{"count":"three"}' } } },
  );

  expect(seen).toEqual({
    failures: [unreadable, unreadable, unreadable],
    names: [],
  });
});

test("while another writer holds the store, a store transaction answers busy with nothing recorded and a read still answers", async () => {
  const seen = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      const busy = yield* Effect.flip(
        store.transact((transaction) => {
          transaction.put(counters, "starts", { count: 2 });
          return Result.succeed(undefined);
        }),
      );
      const row = yield* store.read((reader) => reader.get(counters, "starts"));
      return { busy: failureOf(busy), row };
    }),
    {
      rowTexts: { counters: { starts: '{"count":1}' } },
      writerElsewhere: true,
    },
  );

  expect(seen).toEqual({
    busy: { _tag: "StoreBusy", recorded: "nothing" },
    row: { count: 1 },
  });
});

test("a read is handed get and list and no way to write", async () => {
  const offered = await onTestStore(
    Effect.gen(function* () {
      const store = yield* Store;
      return yield* store.read((reader) => Object.keys(reader).sort());
    }),
  );

  expect(offered).toEqual(["get", "list"]);
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Promise.all([
    onRealStore(
      Effect.gen(function* () {
        const store = yield* Store;
        return yield* store.transact(() => Result.succeed("never"));
      }),
    ),
    onRealStore(
      Effect.gen(function* () {
        const store = yield* Store;
        return yield* store.read(() => "never");
      }),
    ),
    onRealStore(
      Effect.gen(function* () {
        const store = yield* Store;
        return yield* Stream.runCollect(store.changes);
      }),
    ),
  ]);

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: Store.transact",
    "NotBuilt: Store.read",
    "NotBuilt: Store.changes",
  ]);
});
