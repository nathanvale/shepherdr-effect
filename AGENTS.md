# Repository commands

Use the existing repository CLI at src/cli.ts. Add commands through src/commands.ts.
Keep domain implementation in separate files and preserve one public application CLI.

Check command: bun run check
Smoke: bun run start --help
Source packet: https://mermaid.ai/app/projects/940d39a4-c08b-4b93-8c20-857afb8eff8c/diagrams/6b7364f4-7339-4543-a17b-73f1a15cbe26
Template source: a11c06d22e61277fca5a547a99272bb61dd3a41a

## Agent skills

Index of every agent doc and its trigger: `docs/agents/README.md`.

### Issue tracker

Creating, reading or closing an issue or spec: Linear. See
`docs/agents/issue-tracker.md`.

### Triage labels

Applying a triage label: the five default names. See
`docs/agents/triage-labels.md`.

### Domain docs

Before exploring code, or naming a folder, file, type, function or variable:
single-context glossary with a glossary map. See `docs/agents/domain.md`.
