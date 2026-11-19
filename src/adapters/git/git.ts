import { Context, Data, Effect, Layer, Ref, Result } from "effect";
import { type NotBuilt, notBuilt } from "../not-built.ts";

export interface PushRemote {
  readonly remote: string;
  readonly pushUrl: string;
  readonly urls: ReadonlyArray<string>;
}

interface Worktree {
  readonly path: string;
  readonly branch: string;
  readonly adopted: boolean;
}

interface BranchPush {
  readonly folder: string;
  readonly remote: string;
  readonly branch: string;
  readonly candidateCommit: string;
}

class NotARepository extends Data.TaggedError("NotARepository")<{
  readonly folder: string;
}> {}

class BranchNotFound extends Data.TaggedError("BranchNotFound")<{
  readonly branch: string;
}> {}

class PushRefused extends Data.TaggedError("PushRefused")<{
  readonly branch: string;
  readonly remoteCommit: string;
}> {}

type Failing<E = never> = E | NotARepository | NotBuilt;

interface GitShape {
  readonly adoptWorktree: (
    folder: string,
    branch: string,
    startCommit: string,
  ) => Effect.Effect<Worktree, Failing>;
  readonly removeWorktree: (
    folder: string,
    branch: string,
  ) => Effect.Effect<void, Failing>;
  readonly readBranch: (
    folder: string,
    branch: string,
  ) => Effect.Effect<string, Failing<BranchNotFound>>;
  readonly deleteBranch: (
    folder: string,
    branch: string,
  ) => Effect.Effect<void, Failing<BranchNotFound>>;
  readonly isAncestor: (
    folder: string,
    commit: string,
    branch: string,
  ) => Effect.Effect<boolean, Failing<BranchNotFound>>;
  readonly readPushRemote: (
    folder: string,
  ) => Effect.Effect<PushRemote | undefined, Failing>;
  readonly pushBranch: (
    push: BranchPush,
  ) => Effect.Effect<void, Failing<PushRefused>>;
  readonly readRemoteBranch: (
    folder: string,
    remote: string,
    branch: string,
  ) => Effect.Effect<string | undefined, Failing>;
}

export interface RepositoryInMemory {
  readonly worktreeRoot: string;
  readonly branches: Readonly<Record<string, string>>;
  readonly worktrees?: Readonly<Record<string, string>>;
  readonly pushRemote?: PushRemote;
  readonly remoteBranches?: Readonly<Record<string, string>>;
  readonly ancestry?: ReadonlyArray<readonly [older: string, newer: string]>;
}

export type GitTestScript = Readonly<Record<string, RepositoryInMemory>>;

type Step<A, E> = readonly [Result.Result<A, E>, RepositoryInMemory];

function answering<A>(
  answer: A,
  repository: RepositoryInMemory,
): Step<A, never> {
  return [Result.succeed(answer), repository];
}

function refusing<E>(
  failure: E,
  repository: RepositoryInMemory,
): Step<never, E> {
  return [Result.fail(failure), repository];
}

function follows(
  repository: RepositoryInMemory,
  older: string,
  newer: string,
): boolean {
  return (
    older === newer ||
    (repository.ancestry ?? []).some(
      ([before, after]) => before === older && after === newer,
    )
  );
}

const seam = "Git";

export class Git extends Context.Service<Git, GitShape>()("Git") {
  static readonly layer = Layer.succeed(Git, {
    adoptWorktree: () => notBuilt(seam, "adoptWorktree"),
    removeWorktree: () => notBuilt(seam, "removeWorktree"),
    readBranch: () => notBuilt(seam, "readBranch"),
    deleteBranch: () => notBuilt(seam, "deleteBranch"),
    isAncestor: () => notBuilt(seam, "isAncestor"),
    readPushRemote: () => notBuilt(seam, "readPushRemote"),
    pushBranch: () => notBuilt(seam, "pushBranch"),
    readRemoteBranch: () => notBuilt(seam, "readRemoteBranch"),
  });

  static layerTestWith(script: GitTestScript): Layer.Layer<Git> {
    return Layer.effect(
      Git,
      Effect.gen(function* () {
        const repositories = yield* Ref.make(script);
        const inRepository = <A, E = never>(
          folder: string,
          step: (repository: RepositoryInMemory) => Step<A, E>,
        ): Effect.Effect<A, E | NotARepository> =>
          Ref.modify(
            repositories,
            (
              all,
            ): readonly [
              Result.Result<A, E | NotARepository>,
              GitTestScript,
            ] => {
              const repository = all[folder];
              if (repository === undefined)
                return [Result.fail(new NotARepository({ folder })), all];
              const [answer, after] = step(repository);
              return [answer, { ...all, [folder]: after }];
            },
          ).pipe(Effect.flatMap((answer) => Effect.fromResult(answer)));
        const withTip = <A>(
          folder: string,
          branch: string,
          answer: (tip: string, repository: RepositoryInMemory) => A,
        ) =>
          inRepository(folder, (repository) => {
            const tip = repository.branches[branch];
            return tip === undefined
              ? refusing(new BranchNotFound({ branch }), repository)
              : answering(answer(tip, repository), repository);
          });

        return {
          adoptWorktree: (folder, branch, startCommit) =>
            inRepository(folder, (repository) => {
              const path = `${repository.worktreeRoot}/${branch}`;
              const adopted = repository.worktrees?.[path] === branch;
              return answering(
                { path, branch, adopted },
                {
                  ...repository,
                  branches: { [branch]: startCommit, ...repository.branches },
                  worktrees: { ...repository.worktrees, [path]: branch },
                },
              );
            }),
          removeWorktree: (folder, branch) =>
            inRepository(folder, (repository) =>
              answering(undefined, {
                ...repository,
                worktrees: Object.fromEntries(
                  Object.entries(repository.worktrees ?? {}).filter(
                    ([, checkedOut]) => checkedOut !== branch,
                  ),
                ),
              }),
            ),
          readBranch: (folder, branch) => withTip(folder, branch, (tip) => tip),
          deleteBranch: (folder, branch) =>
            inRepository(folder, (repository) => {
              const { [branch]: tip, ...branches } = repository.branches;
              return tip === undefined
                ? refusing(new BranchNotFound({ branch }), repository)
                : answering(undefined, { ...repository, branches });
            }),
          isAncestor: (folder, commit, branch) =>
            withTip(folder, branch, (tip, repository) =>
              follows(repository, commit, tip),
            ),
          readPushRemote: (folder) =>
            inRepository(folder, (repository) =>
              answering(repository.pushRemote, repository),
            ),
          pushBranch: ({ folder, remote, branch, candidateCommit }) =>
            inRepository(folder, (repository) => {
              const name = `${remote}/${branch}`;
              const remoteCommit = repository.remoteBranches?.[name];
              return remoteCommit === undefined ||
                follows(repository, remoteCommit, candidateCommit)
                ? answering(undefined, {
                    ...repository,
                    remoteBranches: {
                      ...repository.remoteBranches,
                      [name]: candidateCommit,
                    },
                  })
                : refusing(
                    new PushRefused({ branch, remoteCommit }),
                    repository,
                  );
            }),
          readRemoteBranch: (folder, remote, branch) =>
            inRepository(folder, (repository) =>
              answering(
                repository.remoteBranches?.[`${remote}/${branch}`],
                repository,
              ),
            ),
        };
      }),
    );
  }

  static readonly layerTest = Git.layerTestWith({});
}
