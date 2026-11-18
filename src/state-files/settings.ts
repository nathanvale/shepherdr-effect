import { Schema } from "effect";

const optional = Schema.optionalKey;

/** The agent a role runs, as the model button keeps it (service/settings.ts `set`, "role.*"). */
const RoleAgent = Schema.Struct({
  agent: optional(Schema.String),
  model: optional(Schema.NullOr(Schema.String)),
  effort: optional(Schema.NullOr(Schema.String)),
  fast: optional(Schema.Boolean),
  perm: optional(Schema.NullOr(Schema.String)),
});

// "" is a level's own empty value (core/settings.js `providerValue`).
const ProviderSection = Schema.Struct({
  route: optional(Schema.Literals(["personal", "azure-foundry", ""])),
  azure_subscription: optional(Schema.String),
  claude_resource: optional(Schema.String),
  claude_deployment: optional(Schema.String),
  claude_auth: optional(
    Schema.Literals(["entra-id", "api-key", "bearer-token", ""]),
  ),
  codex_endpoint: optional(Schema.String),
  codex_deployment: optional(Schema.String),
  codex_auth: optional(Schema.Literals(["api-key", ""])),
  worker_claude_deployment: optional(Schema.String),
  worker_codex_deployment: optional(Schema.String),
  coordinator_claude_deployment: optional(Schema.String),
  coordinator_codex_deployment: optional(Schema.String),
});

/** What a level may set for the agents and tasks under it (core/settings.js, settings.py `DEFAULTS`). */
const sections = {
  tasks: optional(
    Schema.Struct({
      merge: optional(Schema.Literals(["ask", "checks", "auto"])),
      review_rounds: optional(Schema.Int),
      must_fix: optional(Schema.Literals(["blocker", "major", "minor"])),
      proof: optional(Schema.Boolean),
      max_running: optional(Schema.Int),
      archive_after: optional(Schema.Int),
      worktrees: optional(Schema.Boolean),
      start_notes: optional(Schema.String),
      finish_notes: optional(Schema.String),
      base: optional(Schema.String),
      branch: optional(Schema.String),
      worktree_root: optional(Schema.String),
    }),
  ),
  automations: optional(Schema.Struct({ enabled: optional(Schema.Boolean) })),
  worker: optional(RoleAgent),
  reviewer: optional(RoleAgent),
  coordinator: optional(RoleAgent),
  backup: optional(Schema.Struct({ agent: optional(Schema.String) })),
  agents: optional(
    Schema.Struct({
      reactions: optional(Schema.Boolean),
      suggestions: optional(Schema.Boolean),
      feedback: optional(Schema.Boolean),
      feedback_repo: optional(Schema.String),
    }),
  ),
  // Where Reactions lived before it was for every agent (core/settings.js `upgradeReactions`).
  assistant: optional(Schema.Struct({ reactions: optional(Schema.Boolean) })),
  autopilot: optional(
    Schema.Struct({
      every: optional(Schema.String),
      events: optional(Schema.Array(Schema.String)),
      heartbeat: optional(Schema.String),
      direction: optional(Schema.String),
    }),
  ),
  provider: optional(ProviderSection),
};

/** A machine's own rows on the Machines page. A limit set to null is switched off. */
const MachineRows = Schema.Struct({
  start_memory: optional(Schema.NullOr(Schema.Number)),
  start_load: optional(Schema.NullOr(Schema.Number)),
  start_disk: optional(Schema.NullOr(Schema.Number)),
  low_priority: optional(Schema.Boolean),
  worker_memory: optional(Schema.Int),
  // In the pilot's file. No reader or writer at 9859c344 names it.
  credential_delivery: optional(Schema.String),
});

/**
 * `settings.json`: the person's settings in three layers, the most specific
 * winning. Written whole by the window, the service and herdr-task
 * (service/settings.ts `writeSettings`, settings.py `write_autopilot`).
 */
export const Settings = Schema.Struct({
  version: Schema.Literal(1),
  // Both set only on a copy the window pushed to another machine (`pushBody`).
  pushed_from: optional(Schema.String),
  here: optional(Schema.String),
  everywhere: optional(
    Schema.Struct({
      ...sections,
      machine: optional(MachineRows),
      off: optional(Schema.Array(Schema.String)),
    }),
  ),
  // Open by machine name ("local" is the computer whose window wrote the file).
  machines: optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        ...sections,
        machine: optional(MachineRows),
        home: optional(Schema.Boolean),
      }),
    ),
  ),
  // Open by space id ("<machine>/<id>" for a space on another machine).
  spaces: optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        ...sections,
        folder: optional(Schema.String),
        name: optional(Schema.String),
        machine: optional(Schema.String),
      }),
    ),
  ),
});

/** `model-picks.json`: pinned and recently used models, each "<agent>:<model>" (core/agents.js `parsePicks`). */
export const ModelPicks = Schema.Struct({
  pinned: Schema.Array(Schema.String),
  recent: Schema.Array(Schema.String),
});
