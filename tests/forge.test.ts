import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  BitbucketForge,
  type ForgeTestScript,
  GitHubForge,
  type MatchedRepository,
  PullRequestView,
} from "../src/adapters/forge/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";
import { anotherAttemptId, attemptId } from "./attempt-fixtures.ts";

const onGitHub: MatchedRepository<"github"> = {
  forge: "github",
  host: "github.com",
  repository: "nathanvale/shepherdr",
};
const onBitbucket: MatchedRepository<"bitbucket"> = {
  forge: "bitbucket",
  host: "bitbucket.org",
  repository: "monash/extension",
};
const branch = {
  sourceBranch: "task/hat-4",
  destinationBranch: "main",
  candidateCommit: "c0ffee1",
  title: "HAT-4 Stub the forge seam",
  description: "Checks: none yet.",
};
const permit = {
  forge: "github",
  pullRequest: 1,
  candidateCommit: "c0ffee1",
} as const;

function onGitHubForge<A, E>(
  program: Effect.Effect<A, E, GitHubForge>,
  script?: ForgeTestScript,
): Promise<A> {
  const layer =
    script === undefined
      ? GitHubForge.layerTest
      : GitHubForge.layerTestWith(script);
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

function onBitbucketForge<A, E>(
  program: Effect.Effect<A, E, BitbucketForge>,
  script?: ForgeTestScript,
): Promise<A> {
  const layer =
    script === undefined
      ? BitbucketForge.layerTest
      : BitbucketForge.layerTestWith(script);
  return Effect.runPromise(program.pipe(Effect.provide(layer)));
}

const opened = Effect.flatMap(GitHubForge, (forge) =>
  forge.publishStage(onGitHub, { ...branch, stage: "open", attemptId }),
);

const openedView: PullRequestView = {
  identity: {
    forge: "github",
    host: "github.com",
    repository: "nathanvale/shepherdr",
    number: 1,
    url: "https://github.com/nathanvale/shepherdr/pull/1",
  },
  state: "open",
  draft: false,
  title: "HAT-4 Stub the forge seam",
  candidateCommit: "c0ffee1",
  sourceBranch: "task/hat-4",
  destinationBranch: "main",
  checks: {
    candidateCommit: "c0ffee1",
    result: "empty",
    failed: [],
    running: 0,
    total: 0,
  },
};

test("the open stage publishes a pull request that reads back as the view callers see", async () => {
  const seen = await onGitHubForge(
    Effect.gen(function* () {
      const forge = yield* GitHubForge;
      const published = yield* opened;
      const read = yield* forge.readPullRequest(onGitHub, 1);
      const elsewhere = yield* Effect.flip(
        forge.readPullRequest(
          { ...onGitHub, repository: "nathanvale/other" },
          1,
        ),
      );
      return {
        published: Schema.encodeSync(PullRequestView)(published),
        read,
        elsewhere: failureOf(elsewhere),
      };
    }),
  );

  expect(seen).toEqual({
    published: openedView,
    read: openedView,
    elsewhere: { _tag: "PullRequestNotFound", sought: "#1" },
  });
});

test("a stage is observed only through the pull request that carries its attempt id line", async () => {
  const seen = await onGitHubForge(
    Effect.gen(function* () {
      const forge = yield* GitHubForge;
      yield* opened;
      const first = yield* forge.observeStage(onGitHub, "open", attemptId);
      const before = yield* forge.observeStage(
        onGitHub,
        "open",
        anotherAttemptId,
      );
      const again = yield* forge.publishStage(onGitHub, {
        ...branch,
        stage: "open",
        attemptId: anotherAttemptId,
      });
      const after = yield* forge.observeStage(
        onGitHub,
        "open",
        anotherAttemptId,
      );
      return { first, before, number: again.identity.number, after };
    }),
  );

  const evidence = {
    _tag: "PositiveEvidence",
    result: "https://github.com/nathanvale/shepherdr/pull/1",
  } as const;
  expect(seen).toEqual({
    first: { ...evidence, attemptId },
    before: { _tag: "NoEvidence" },
    number: 1,
    after: { ...evidence, attemptId: anotherAttemptId },
  });
});

test("a GitHub merge takes a merge permit for the candidate commit the pull request holds", async () => {
  const seen = await onGitHubForge(
    Effect.gen(function* () {
      const forge = yield* GitHubForge;
      yield* opened;
      const moved = yield* Effect.flip(
        forge.merge(onGitHub, { ...permit, candidateCommit: "0ddba11" }),
      );
      const missing = yield* Effect.flip(
        forge.merge(onGitHub, { ...permit, pullRequest: 7 }),
      );
      const merged = yield* forge.merge(onGitHub, permit);
      const twice = yield* Effect.flip(forge.merge(onGitHub, permit));
      return {
        refusals: [moved, missing, twice].map(failureOf),
        state: merged.state,
        checks: merged.checks,
      };
    }),
    { checkResult: "passed" },
  );

  expect(seen).toEqual({
    refusals: [
      {
        _tag: "MergeRefused",
        reason: "The merge permit is for another candidate commit.",
      },
      { _tag: "PullRequestNotFound", sought: "#7" },
      { _tag: "MergeRefused", reason: "The pull request is merged." },
    ],
    state: "merged",
    checks: {
      candidateCommit: "c0ffee1",
      result: "passed",
      failed: [],
      running: 0,
      total: 1,
    },
  });
});

test("a Bitbucket publication opens a draft, then marks that draft ready", async () => {
  const seen = await onBitbucketForge(
    Effect.gen(function* () {
      const forge = yield* BitbucketForge;
      const draft = yield* forge.publishStage(onBitbucket, {
        ...branch,
        stage: "draft",
        attemptId,
      });
      const readyBefore = yield* forge.observeStage(
        onBitbucket,
        "ready",
        attemptId,
      );
      const ready = yield* forge.publishStage(onBitbucket, {
        ...branch,
        stage: "ready",
        attemptId: anotherAttemptId,
      });
      return {
        url: draft.identity.url,
        drafts: [draft.draft, ready.draft],
        numbers: [draft.identity.number, ready.identity.number],
        failed: ready.checks.failed,
        draftObserved: yield* forge.observeStage(
          onBitbucket,
          "draft",
          attemptId,
        ),
        readyBefore,
        readyAfter: yield* forge.observeStage(
          onBitbucket,
          "ready",
          anotherAttemptId,
        ),
      };
    }),
    { checkResult: "failed" },
  );

  const url = "https://bitbucket.org/monash/extension/pull-requests/1";
  expect(seen).toEqual({
    url,
    drafts: [true, false],
    numbers: [1, 1],
    failed: ["build"],
    draftObserved: { _tag: "PositiveEvidence", attemptId, result: url },
    readyBefore: { _tag: "NoEvidence" },
    readyAfter: {
      _tag: "PositiveEvidence",
      attemptId: anotherAttemptId,
      result: url,
    },
  });
});

test("the ready stage finds no draft to mark and says so", async () => {
  const refusal = await onBitbucketForge(
    Effect.flatMap(BitbucketForge, (forge) =>
      Effect.flip(
        forge.publishStage(onBitbucket, {
          ...branch,
          stage: "ready",
          attemptId,
        }),
      ),
    ),
  );

  expect(failureOf(refusal)).toEqual({
    _tag: "PullRequestNotFound",
    sought: "the draft from task/hat-4",
  });
});

test("the Bitbucket forge has three entries and no merge, in its test layer and its real layer", async () => {
  const offered = Effect.map(BitbucketForge, (forge) =>
    Object.keys(forge).sort(),
  );
  const entries = await Promise.all([
    onBitbucketForge(offered),
    Effect.runPromise(offered.pipe(Effect.provide(BitbucketForge.layer))),
  ]);

  const three = ["observeStage", "publishStage", "readPullRequest"];
  expect(entries).toEqual([three, three]);
});

for (const [failing, tag] of [
  ["unavailable", "ForgeUnavailable"],
  ["sign-in-required", "ForgeSignInRequired"],
  ["reply-unreadable", "ForgeReplyUnreadable"],
] as const)
  test(`a forge that is ${failing} answers ${tag} and publishes nothing`, async () => {
    const refusals = await onGitHubForge(
      Effect.gen(function* () {
        const forge = yield* GitHubForge;
        return [
          yield* Effect.flip(opened),
          yield* Effect.flip(forge.readPullRequest(onGitHub, 1)),
          yield* Effect.flip(forge.observeStage(onGitHub, "open", attemptId)),
          yield* Effect.flip(forge.merge(onGitHub, permit)),
        ].map(failureOf);
      }),
      { failing },
    );

    const refusal = { _tag: tag, forge: "github" };
    expect(refusals).toEqual([refusal, refusal, refusal, refusal]);
  });

test("the real layers answer NotBuilt for each entry, naming it", async () => {
  const gitHub = Effect.gen(function* () {
    const forge = yield* GitHubForge;
    return yield* Effect.all([
      Effect.flip(forge.readPullRequest(onGitHub, 1)),
      Effect.flip(opened),
      Effect.flip(forge.observeStage(onGitHub, "open", attemptId)),
      Effect.flip(forge.merge(onGitHub, permit)),
    ]);
  });
  const bitbucket = Effect.gen(function* () {
    const forge = yield* BitbucketForge;
    return yield* Effect.all([
      Effect.flip(forge.readPullRequest(onBitbucket, 1)),
      Effect.flip(
        forge.publishStage(onBitbucket, {
          ...branch,
          stage: "draft",
          attemptId,
        }),
      ),
      Effect.flip(forge.observeStage(onBitbucket, "draft", attemptId)),
    ]);
  });
  const unbuilt = await Effect.runPromise(
    Effect.all([gitHub, bitbucket]).pipe(
      Effect.provide(GitHubForge.layer),
      Effect.provide(BitbucketForge.layer),
    ),
  );

  expect(unbuilt.flat().map(unbuiltEntryOf)).toEqual([
    "NotBuilt: GitHubForge.readPullRequest",
    "NotBuilt: GitHubForge.publishStage",
    "NotBuilt: GitHubForge.observeStage",
    "NotBuilt: GitHubForge.merge",
    "NotBuilt: BitbucketForge.readPullRequest",
    "NotBuilt: BitbucketForge.publishStage",
    "NotBuilt: BitbucketForge.observeStage",
  ]);
});
