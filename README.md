# shepherdr-effect

Scratch repository. It holds a design experiment: how the Shepherdr fork
(`nathanvale/herdr-projects` main at `9859c344`) would look if written today
in TypeScript on Effect v4, running on Bun 1.4.4 with no Python.

This is a design with compiling stubs and one proven thin slice. It is not a
working replacement, and nothing here runs against a live Herdr install.

- **Run:** `bun run start --help`
- **Check:** `bun run check`
- **Remote:** `nathanvale/shepherdr-effect` on GitHub, public. The work is on
  the `feat/effect-v4-design` branch; `main` holds only the comparison base.
- **Source:** the C4 diagram named under Source packet below, and the fork's
  code at `9859c344`. No vault project packet exists yet.
- **Promote** to `~/code/<repository>/` with a vault project packet if the
  design is accepted for a real build.
- **Retire** once the design is rejected or superseded and its findings are
  recorded. Deletion is Nathan's decision.

It was generated from the durable profile of `bun-typescript-template`, so it
carries that profile's full toolchain, including Fallow. Three pins now follow
the template's own root. See
[Differences from the template](#differences-from-the-template). The rest of
this file is the profile's own guide.

## Source packet

`https://mermaid.ai/app/projects/940d39a4-c08b-4b93-8c20-857afb8eff8c/diagrams/6b7364f4-7339-4543-a17b-73f1a15cbe26`

Bootstrap substitutes this token with the `--source-packet` value supplied at
generation time.

## Pinned toolchain

- Bun `1.4.4` (`packageManager`, `bunfig.toml` `install.auto = "disable"`)
- Native TypeScript `7.1.0-beta` for compilation, TypeScript `6.0.2` for linting
- ESLint `10.15.0` with typescript-eslint `8.73.0` and its recommended typed preset
- `@types/bun` `1.4.4` (exact devDependency)
- Biome `2.6.7` for formatting only
- Fallow and its semantic companion `3.43.2` (exact). The companion keeps its
  own TypeScript `7.0.2`.

`node_modules/.bin/tsc --version` prints `Version 7.1.0-beta`. Keep the
`@typescript/old` override and the version 3 `bun.lock` together. The override
holds the TypeScript that ESLint loads at `6.0.2`.

## Differences from the template

Compared with `bun-typescript-template` at `a11c06d`.

Three pins match the template's own root. The durable profile keeps generated
repositories on the older versions, so these pins are a decision for this
repository only.

| Pin                  | Durable profile        | This repository             |
| -------------------- | ---------------------- | --------------------------- |
| `@typescript/native` | `npm:typescript@7.0.2` | `npm:typescript@7.1.0-beta` |
| `typescript-eslint`  | `8.72.2`               | `8.73.0`                    |
| `@types/bun`         | `1.4.0`                | `1.4.4`                     |

Three more differences from the durable profile come from the design work:

- `package.json` adds the `effect` dependency.
- `eslint.config.mjs` applies `repository/no-domain-output` to `src/inventory`
  and `src/state-files` as well as `src/domains`.
- `biome.jsonc` skips `inventory/`.

The durable profile generates none of the template root's gates. This
repository adopts them from the root one at a time. Each gate tool and lint
rule file here is the root's own file, byte for byte.

Adopted from the template root:

- `check:file-size` refuses a tracked text file over 5,000 tokens. It is the
  first step of `bun run check`. `GLOSSARY.md` is its one recorded hit.
- `doctor` runs before the tests. It checks the Bun version, the installed
  TypeScript versions and Fallow's own readiness.
- The root's ESLint rules cover comments, host paths, the `in` operator,
  `localeCompare`, test structure and type assertion shortcuts.
  `eslint-suppressions.json` records no hit. The root also applies the
  kernel's lint module, which this repository does not have, because it holds
  no `kernel/`.
- Fallow checks folder boundaries and a recorded health baseline. The zones
  are the root's without its `kernel` zone. Fallow here also gates every
  finding and requires complete type-aware evidence, which the root does not.
- `check:names` refuses a new file or folder name that uses a word
  `GLOSSARY.md` lists under Avoid. Two naming tests run with `bun test`: they
  judge every tracked name, and they fail on a glossary term that no tracked
  file uses unless `tests/template/naming/recorded-unused-terms.json` records
  it. Nine terms are recorded there. `names.test.ts` differs from the root's
  copy in one assertion, which names three paths this repository has.
- `repository.json` describes this repository to the gate tools: its web
  address, the commit check's fixed point and its test areas.
  `bun run test:area <area>` runs one test area: `program` for the test files
  in `tests/`, `template` for the gate tests under `tests/template/`. Run it
  without an area to list the choices. The names check refuses a test file
  outside those folders.
- `check:commits <base>` installs, type checks and lints each commit after
  the fixed point, each at its own head. The fixed point in `repository.json`
  is `d9b08e8`, the last commit before the first template gate arrived.
  `.fallowrc.json` records the exports of `scripts/process-runner.ts` that
  nothing here imports, because the tools' own tests stay in the template.
- `fault-replay` applies each recorded fault in a temporary worktree and
  confirms that its named test fails. The one fault record removes the state
  check's usage refusal, and `tests/state-check.test.ts` must catch it.
  `bun run planted-fault:add` writes a new record.
- The agent hooks run the names check on each file an agent creates (a
  Claude Code `Write`, a Codex `apply_patch`), and block an agent's
  `git commit` or `git push` when Fallow's audit fails. `CLAUDE.md` loads
  `AGENTS.md` into Claude Code. Fallow's two pointer skills are under
  `.agents/skills/`, with links under `.claude/skills/`. `biome.jsonc` skips
  the skill folders, as the root does.

The template root has these gates, and this repository does not have them yet:

- The Git hooks run the names, file size, format, lint, type and Fallow checks
  on staged files before a commit, and Fallow and the fault replay before a
  push.
- The CI workflows run the checks on every pull request and every push to
  `main`, and the full check on macOS each night.

The root's tests of its own gate tools stay in the template, apart from the
two naming tests above. So do its `CODING_STANDARDS.md` and `docs/standards/`.

## Checks this profile includes

`bun run check` runs, in order:

1. `lint`: typed ESLint on source and tests, including repository-local rules.
2. `format:check`: Biome formatting without writes; lint and assist are disabled.
3. `typecheck`: native TypeScript, inheriting the strict base configuration.
4. `test`: Bun tests, including the repository CLI process tests.
5. `quality:fallow`: complete native semantic evidence and all findings gated.

## CI

This profile ships no CI workflow. CI is optional: adopt it deliberately when
the repository needs one, not automatically because it is durable or has been
promoted from scratch.

## Bootstrap

Install Node.js and put it on `PATH` before running the checks. Node.js 24 is
a supported choice. Fallow runs `node` for its type-aware TypeScript analysis.
Run `node -p 'process.versions.bun ? "Bun" : process.version'` to check which
runtime your shell finds. Expect a Node.js version such as `v24.20.0`.

Bootstrap does not initialize Git. Fallow's audit needs a Git comparison base even when all findings are gated. Establish an empty local baseline before the first check so
the generated scaffold remains visible as new work:

```sh
git init -b main
git commit --allow-empty -m "chore: establish comparison base"
bun install --frozen-lockfile
bun run check
```

After the check passes, commit the generated scaffold with your normal Git
identity. Git must already have your user name and email configured.

## Optional monorepo layout

A multi-package layout is available as a separate, self-contained bootstrap
profile. From the template checkout, run `bun run bootstrap --profile durable
--destination PATH --source-packet PATH_OR_URL --monorepo`. It is not required
here and is not shipped as a subdirectory of this repository.
