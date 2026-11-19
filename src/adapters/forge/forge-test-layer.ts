import { Effect, Ref } from "effect";
import {
  attemptIdLine,
  type CheckObservation,
  type ForgeKind,
  ForgeReplyUnreadable,
  type ForgeShape,
  ForgeSignInRequired,
  ForgeUnavailable,
  type MatchedRepository,
  MergeRefused,
  type MergingForge,
  PullRequestNotFound,
  type PullRequestView,
  type StagePublication,
} from "./forge.ts";

export interface ForgeTestScript {
  readonly failing?: "unavailable" | "sign-in-required" | "reply-unreadable";
  readonly checkResult?: CheckObservation["result"];
}

interface Held {
  readonly view: PullRequestView;
  readonly description: string;
}

type Stage = "open" | "draft" | "ready";

const failures = {
  unavailable: (forge: ForgeKind) => new ForgeUnavailable({ forge }),
  "sign-in-required": (forge: ForgeKind) => new ForgeSignInRequired({ forge }),
  "reply-unreadable": (forge: ForgeKind) => new ForgeReplyUnreadable({ forge }),
};

function checksOf(
  result: CheckObservation["result"],
  candidateCommit: string,
): CheckObservation {
  const count = (wanted: CheckObservation["result"]) =>
    result === wanted ? 1 : 0;
  return {
    candidateCommit,
    result,
    failed: result === "failed" ? ["build"] : [],
    running: count("pending"),
    total: result === "empty" ? 0 : 1,
  };
}

function inRepository(
  { view }: Held,
  repository: MatchedRepository<ForgeKind>,
): boolean {
  return (
    view.identity.host === repository.host &&
    view.identity.repository === repository.repository
  );
}

export function forgeInMemory<Kind extends ForgeKind>(
  forge: Kind,
  script: ForgeTestScript,
): Effect.Effect<ForgeShape<Kind, "open" | "draft" | "ready"> & MergingForge> {
  return Effect.gen(function* () {
    const held = yield* Ref.make<ReadonlyArray<Held>>([]);
    const reached: Effect.Effect<
      ReadonlyArray<Held>,
      ForgeUnavailable | ForgeSignInRequired | ForgeReplyUnreadable
    > = script.failing === undefined
      ? Ref.get(held)
      : Effect.fail(failures[script.failing](forge));
    const keep = (changed: Held) =>
      Ref.update(held, (all) => [
        ...all.filter(
          ({ view }) => view.identity.url !== changed.view.identity.url,
        ),
        changed,
      ]).pipe(Effect.as(changed.view));
    const found = (
      repository: MatchedRepository<ForgeKind>,
      sought: string,
      wanted: (each: Held) => boolean,
    ) =>
      reached.pipe(
        Effect.flatMap((all) => {
          const match = all.find(
            (each) => inRepository(each, repository) && wanted(each),
          );
          return match === undefined
            ? Effect.fail(new PullRequestNotFound({ sought }))
            : Effect.succeed(match);
        }),
      );
    const opened = (
      repository: MatchedRepository<ForgeKind>,
      publication: StagePublication<Stage>,
      number: number,
    ): Held => ({
      view: {
        identity: {
          ...repository,
          number,
          url: `https://${repository.host}/${repository.repository}/${forge === "github" ? "pull" : "pull-requests"}/${number}`,
        },
        state: "open",
        draft: publication.stage === "draft",
        title: publication.title,
        candidateCommit: publication.candidateCommit,
        sourceBranch: publication.sourceBranch,
        destinationBranch: publication.destinationBranch,
        checks: checksOf(
          script.checkResult ?? "empty",
          publication.candidateCommit,
        ),
      },
      description: publication.description,
    });

    return {
      readPullRequest: (repository, number) =>
        found(
          repository,
          `#${number}`,
          ({ view }) => view.identity.number === number,
        ).pipe(Effect.map(({ view }) => view)),
      publishStage: (repository, publication) =>
        Effect.gen(function* () {
          const all = yield* reached;
          const existing = all.find(
            (each) =>
              inRepository(each, repository) &&
              each.view.state === "open" &&
              each.view.sourceBranch === publication.sourceBranch,
          );
          if (existing === undefined && publication.stage === "ready")
            return yield* new PullRequestNotFound({
              sought: `the draft from ${publication.sourceBranch}`,
            });
          const before =
            existing ?? opened(repository, publication, all.length + 1);
          return yield* keep({
            view: {
              ...before.view,
              draft: before.view.draft && publication.stage !== "ready",
            },
            description: `${before.description}\n${attemptIdLine(publication.attemptId)}`,
          });
        }),
      observeStage: (repository, stage, attemptId) =>
        reached.pipe(
          Effect.map((all) => {
            const [only, ...others] = all.filter(
              (each) =>
                inRepository(each, repository) &&
                each.description
                  .split("\n")
                  .includes(attemptIdLine(attemptId)) &&
                !(stage === "ready" && each.view.draft),
            );
            return only === undefined || others.length > 0
              ? { _tag: "NoEvidence" }
              : {
                  _tag: "PositiveEvidence",
                  attemptId,
                  result: only.view.identity.url,
                };
          }),
        ),
      merge: (repository, permit) =>
        found(
          repository,
          `#${permit.pullRequest}`,
          ({ view }) => view.identity.number === permit.pullRequest,
        ).pipe(
          Effect.flatMap((before) => {
            const { view } = before;
            const reason =
              view.state !== "open"
                ? `The pull request is ${view.state}.`
                : view.draft
                  ? "The pull request is a draft."
                  : view.candidateCommit !== permit.candidateCommit
                    ? "The merge permit is for another candidate commit."
                    : undefined;
            return reason === undefined
              ? keep({ ...before, view: { ...view, state: "merged" } })
              : Effect.fail(new MergeRefused({ reason }));
          }),
        ),
    };
  });
}
