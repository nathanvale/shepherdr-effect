# shepherdr-effect

Scratch repository. It holds a design experiment: how the Shepherdr fork
(`nathanvale/herdr-projects` main at `9859c344`) would look if written today
in TypeScript on Effect v4, running on Bun 1.4.4 with no Python.

This is a design with compiling stubs and one proven thin slice. It is not a
working replacement, and nothing here runs against a live Herdr install.

- **Run:** `bun run start --help`
- **Check:** `bun run check`
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

Every other toolchain file equals the durable profile.

The template root has these gates, and this repository has none of them:

- `check:file-size` refuses a tracked text file over 5,000 tokens.
- `check:names` refuses a new file or folder name that uses a word
  `GLOSSARY.md` lists under Avoid.
- `doctor` runs before the tests. It checks the Bun version, the installed
  TypeScript versions and Fallow's own readiness.
- `check:commits` installs, type checks and lints each commit of a pull
  request.
- `fault-replay` applies each recorded fault and confirms that a test fails.
- The Git hooks run the names, file size, format, lint, type and Fallow checks
  on staged files before a commit, and Fallow and the fault replay before a
  push.
- The agent hooks run the names check on each file an agent writes, and block
  an agent's commit or push when Fallow fails.
- The CI workflows run the checks on every pull request and every push to
  `main`, and the full check on macOS each night.
- More ESLint rules cover comments, host paths, the `in` operator,
  `localeCompare`, test structure and type assertion shortcuts.
- Fallow there also checks folder boundaries and a recorded health baseline.
  Fallow here gates every finding and requires complete type-aware evidence,
  which the template root does not.

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
