import { Data, type Effect, Schema } from "effect";
import type {
  AttemptId,
  PositiveEvidence,
} from "../../domains/attempt/index.ts";
import type { NotBuilt } from "../not-built.ts";

export type ForgeKind = "github" | "bitbucket";

export interface MatchedRepository<Kind extends ForgeKind> {
  readonly forge: Kind;
  readonly host: string;
  readonly repository: string;
}

export interface MergePermit {
  readonly forge: "github";
  readonly pullRequest: number;
  readonly candidateCommit: string;
}

const CheckObservation = Schema.Struct({
  candidateCommit: Schema.String,
  result: Schema.Literals(["passed", "failed", "pending", "empty"]),
  failed: Schema.Array(Schema.String),
  running: Schema.Int,
  total: Schema.Int,
});
export type CheckObservation = typeof CheckObservation.Type;

export const PullRequestView = Schema.Struct({
  identity: Schema.Struct({
    forge: Schema.Literals(["github", "bitbucket"]),
    host: Schema.String,
    repository: Schema.String,
    number: Schema.Int,
    url: Schema.String,
  }),
  state: Schema.Literals(["open", "merged", "closed"]),
  draft: Schema.Boolean,
  title: Schema.String,
  candidateCommit: Schema.String,
  sourceBranch: Schema.String,
  destinationBranch: Schema.String,
  checks: CheckObservation,
});
export type PullRequestView = typeof PullRequestView.Type;

export interface StagePublication<Stage extends string> {
  readonly stage: Stage;
  readonly attemptId: AttemptId;
  readonly sourceBranch: string;
  readonly destinationBranch: string;
  readonly candidateCommit: string;
  readonly title: string;
  readonly description: string;
}

export type StageObservation =
  | PositiveEvidence
  | { readonly _tag: "NoEvidence" };

export class ForgeUnavailable extends Data.TaggedError("ForgeUnavailable")<{
  readonly forge: ForgeKind;
}> {}

export class ForgeSignInRequired extends Data.TaggedError(
  "ForgeSignInRequired",
)<{ readonly forge: ForgeKind }> {}

export class ForgeReplyUnreadable extends Data.TaggedError(
  "ForgeReplyUnreadable",
)<{ readonly forge: ForgeKind }> {}

export class PullRequestNotFound extends Data.TaggedError(
  "PullRequestNotFound",
)<{ readonly sought: string }> {}

export class MergeRefused extends Data.TaggedError("MergeRefused")<{
  readonly reason: string;
}> {}

export type ForgeFailure =
  | ForgeUnavailable
  | ForgeSignInRequired
  | ForgeReplyUnreadable
  | NotBuilt;

export interface ForgeShape<Kind extends ForgeKind, Stage extends string> {
  readonly readPullRequest: (
    repository: MatchedRepository<Kind>,
    number: number,
  ) => Effect.Effect<PullRequestView, PullRequestNotFound | ForgeFailure>;
  readonly publishStage: (
    repository: MatchedRepository<Kind>,
    publication: StagePublication<Stage>,
  ) => Effect.Effect<PullRequestView, PullRequestNotFound | ForgeFailure>;
  readonly observeStage: (
    repository: MatchedRepository<Kind>,
    stage: Stage,
    attemptId: AttemptId,
  ) => Effect.Effect<StageObservation, ForgeFailure>;
}

export interface MergingForge {
  readonly merge: (
    repository: MatchedRepository<"github">,
    permit: MergePermit,
  ) => Effect.Effect<
    PullRequestView,
    PullRequestNotFound | MergeRefused | ForgeFailure
  >;
}

export function attemptIdLine(attemptId: AttemptId): string {
  return `Herdr-Operation: ${attemptId}`;
}
