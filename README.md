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
carries that profile's full toolchain, including Fallow. The rest of this file
is the profile's own guide.

## Source packet

`https://mermaid.ai/app/projects/940d39a4-c08b-4b93-8c20-857afb8eff8c/diagrams/6b7364f4-7339-4543-a17b-73f1a15cbe26`

Bootstrap substitutes this token with the `--source-packet` value supplied at
generation time.

## Pinned toolchain

- Bun `1.4.4` (`packageManager`, `bunfig.toml` `install.auto = "disable"`)
- Native TypeScript `7.0.2` for compilation, TypeScript `6.0.2` for linting
- ESLint `10.15.0` with typescript-eslint `8.72.2` and its recommended typed preset
- `@types/bun` `1.4.0` (exact devDependency)
- Biome `2.6.7` for formatting only
- Fallow and its semantic companion `3.43.2` (exact)

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
