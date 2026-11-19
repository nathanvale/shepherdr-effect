import { expect, test } from "bun:test";
import { Effect } from "effect";
import { Git, type GitTestScript } from "../src/adapters/git/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const folder = "work/shepherdr";
const pushRemote = {
  remote: "origin",
  pushUrl: "git@github.com:nathanvale/shepherdr.git",
  urls: ["git@github.com:nathanvale/shepherdr.git"],
};
const script: GitTestScript = {
  [folder]: {
    worktreeRoot: "work/shepherdr.worktrees",
    branches: { main: "m2", "task/hat-3": "a1" },
    worktrees: { "work/shepherdr.worktrees/task/hat-3": "task/hat-3" },
    pushRemote,
    remoteBranches: { "origin/task/hat-3": "a0" },
    ancestry: [
      ["m1", "m2"],
      ["a0", "a1"],
    ],
  },
};

function onTestGit<A, E>(program: Effect.Effect<A, E, Git>): Promise<A> {
  return Effect.runPromise(
    program.pipe(Effect.provide(Git.layerTestWith(script))),
  );
}

test("a worktree is made at its derived path on a new branch, and adopted when it is already there", async () => {
  const seen = await onTestGit(
    Effect.gen(function* () {
      const git = yield* Git;
      const made = yield* git.adoptWorktree(folder, "task/hat-4", "m2");
      const again = yield* git.adoptWorktree(folder, "task/hat-4", "m1");
      const existing = yield* git.adoptWorktree(folder, "task/hat-3", "m2");
      return {
        made,
        again,
        existing,
        tips: [
          yield* git.readBranch(folder, "task/hat-4"),
          yield* git.readBranch(folder, "task/hat-3"),
        ],
      };
    }),
  );

  const path = "work/shepherdr.worktrees/task/hat-4";
  expect(seen).toEqual({
    made: { path, branch: "task/hat-4", adopted: false },
    again: { path, branch: "task/hat-4", adopted: true },
    existing: {
      path: "work/shepherdr.worktrees/task/hat-3",
      branch: "task/hat-3",
      adopted: true,
    },
    tips: ["m2", "a1"],
  });
});

test("a removed worktree is made anew, and a deleted branch is gone", async () => {
  const seen = await onTestGit(
    Effect.gen(function* () {
      const git = yield* Git;
      yield* git.removeWorktree(folder, "task/hat-3");
      const remade = yield* git.adoptWorktree(folder, "task/hat-3", "m2");
      yield* git.deleteBranch(folder, "task/hat-3");
      return {
        adopted: remade.adopted,
        read: failureOf(
          yield* Effect.flip(git.readBranch(folder, "task/hat-3")),
        ),
        deleted: failureOf(
          yield* Effect.flip(git.deleteBranch(folder, "task/hat-3")),
        ),
      };
    }),
  );

  const notFound = { _tag: "BranchNotFound", branch: "task/hat-3" };
  expect(seen).toEqual({ adopted: false, read: notFound, deleted: notFound });
});

test("a commit is an ancestor of a branch when it is the tip or leads to it", async () => {
  const seen = await onTestGit(
    Effect.gen(function* () {
      const git = yield* Git;
      return [
        yield* git.isAncestor(folder, "m2", "main"),
        yield* git.isAncestor(folder, "m1", "main"),
        yield* git.isAncestor(folder, "a1", "main"),
        failureOf(yield* Effect.flip(git.isAncestor(folder, "m1", "gone"))),
      ];
    }),
  );

  expect(seen).toEqual([
    true,
    true,
    false,
    { _tag: "BranchNotFound", branch: "gone" },
  ]);
});

test("a push moves the remote branch forward to the candidate commit and refuses to move it sideways", async () => {
  const seen = await onTestGit(
    Effect.gen(function* () {
      const git = yield* Git;
      const push = { folder, remote: "origin", branch: "task/hat-3" };
      const before = yield* git.readRemoteBranch(
        folder,
        "origin",
        "task/hat-3",
      );
      yield* git.pushBranch({ ...push, candidateCommit: "a1" });
      const after = yield* git.readRemoteBranch(folder, "origin", "task/hat-3");
      const sideways = yield* Effect.flip(
        git.pushBranch({ ...push, candidateCommit: "m2" }),
      );
      yield* git.pushBranch({
        ...push,
        branch: "task/hat-5",
        candidateCommit: "m2",
      });
      return {
        before,
        after,
        sideways: failureOf(sideways),
        kept: yield* git.readRemoteBranch(folder, "origin", "task/hat-3"),
        created: yield* git.readRemoteBranch(folder, "origin", "task/hat-5"),
        absent: yield* git.readRemoteBranch(folder, "origin", "task/hat-6"),
        pushRemote: yield* git.readPushRemote(folder),
      };
    }),
  );

  expect(seen).toEqual({
    before: "a0",
    after: "a1",
    sideways: { _tag: "PushRefused", branch: "task/hat-3", remoteCommit: "a1" },
    kept: "a1",
    created: "m2",
    absent: undefined,
    pushRemote,
  });
});

const everyEntry = Effect.gen(function* () {
  const git = yield* Git;
  const elsewhere = "work/not-a-repository";
  return yield* Effect.all([
    Effect.flip(git.adoptWorktree(elsewhere, "task/hat-4", "m2")),
    Effect.flip(git.removeWorktree(elsewhere, "task/hat-4")),
    Effect.flip(git.readBranch(elsewhere, "main")),
    Effect.flip(git.deleteBranch(elsewhere, "main")),
    Effect.flip(git.isAncestor(elsewhere, "m1", "main")),
    Effect.flip(git.readPushRemote(elsewhere)),
    Effect.flip(
      git.pushBranch({
        folder: elsewhere,
        remote: "origin",
        branch: "main",
        candidateCommit: "m2",
      }),
    ),
    Effect.flip(git.readRemoteBranch(elsewhere, "origin", "main")),
  ]);
});

test("a folder that is not a repository refuses every entry", async () => {
  const refusals = await Effect.runPromise(
    everyEntry.pipe(Effect.provide(Git.layerTest)),
  );

  const refusal = { _tag: "NotARepository", folder: "work/not-a-repository" };
  expect(refusals.map(failureOf)).toEqual(
    Array.from({ length: 8 }, () => refusal),
  );
});

test("the real layer answers NotBuilt for each entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    everyEntry.pipe(Effect.provide(Git.layer)),
  );

  expect(unbuilt.map(unbuiltEntryOf)).toEqual([
    "NotBuilt: Git.adoptWorktree",
    "NotBuilt: Git.removeWorktree",
    "NotBuilt: Git.readBranch",
    "NotBuilt: Git.deleteBranch",
    "NotBuilt: Git.isAncestor",
    "NotBuilt: Git.readPushRemote",
    "NotBuilt: Git.pushBranch",
    "NotBuilt: Git.readRemoteBranch",
  ]);
});
