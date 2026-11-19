// Hand-written state files with made-up values, one or more for each schema.
// Keyed by the path each would have under a state root.

import { engineStateFiles } from "./engine-state-fixtures.ts";
import { T0, taskListFiles } from "./task-list-fixtures.ts";

const STATE = ".local/state/shepherdr";
const HERDR_CORE = ".local/state/herdr-core/default";

/** One valid file for every registry entry, at its path under a state root. */
export const validFiles: Readonly<Record<string, unknown>> = {
  ...taskListFiles,
  ...engineStateFiles,
  ".config/shepherdr/settings.json": {
    version: 1,
    pushed_from: "herdr-app",
    here: "vm-b",
    everywhere: {
      tasks: {
        merge: "ask",
        review_rounds: 1,
        must_fix: "major",
        proof: true,
        max_running: 4,
        archive_after: 7,
        worktrees: true,
        start_notes: "Install packages.",
        finish_notes: "",
        branch: "task/{n}-{slug}",
        worktree_root: "",
      },
      automations: { enabled: true },
      worker: {
        agent: "claude",
        model: "example-model",
        effort: null,
        perm: "auto",
      },
      reviewer: {},
      backup: { agent: "off" },
      agents: {
        reactions: false,
        suggestions: true,
        feedback: true,
        feedback_repo: "example/feedback",
      },
      assistant: { reactions: true },
      autopilot: {
        every: "every 60 minutes",
        events: ["ready"],
        heartbeat: "Keep going.",
        direction: "Ship the widget.",
      },
      provider: { route: "personal", claude_auth: "", codex_auth: "api-key" },
      machine: { start_memory: null, start_load: 1.5, low_priority: true },
      off: ["insights"],
    },
    machines: {
      local: {
        machine: { worker_memory: 8, credential_delivery: "example" },
        home: false,
      },
    },
    spaces: {
      sp1: {
        folder: "/example-home/widgets",
        name: "Widgets",
        machine: "vm-b",
        tasks: { base: "develop" },
        coordinator: {
          agent: "codex",
          model: null,
          effort: "high",
          fast: false,
          perm: null,
        },
        provider: {
          route: "azure-foundry",
          azure_subscription: "9a8b7c6d-0000-4000-8000-000000000002",
          claude_resource: "example-resource",
          claude_deployment: "example-deployment",
          claude_auth: "bearer-token",
          codex_endpoint: "https://example.openai.azure.com/openai/v1",
          codex_deployment: "example-codex",
          worker_claude_deployment: "",
          worker_codex_deployment: "",
          coordinator_claude_deployment: "",
          coordinator_codex_deployment: "",
        },
      },
    },
  },
  ".config/shepherdr/model-picks.json": {
    pinned: ["claude:example-model"],
    recent: [],
  },
  [`${STATE}/service/service.json`]: {
    port: 4317,
    id: "00112233445566778899aabbccddeeff",
    pid: 4242,
    version: "9.9.9",
  },
  [`${STATE}/service/web.json`]: {
    on: true,
    link: "https://example-host.example.invalid/shepherdr/",
    qr: null,
    why: null,
    share_error: null,
    https_port: 443,
    serve: {
      rows: [
        {
          name: "example-host",
          here: true,
          state: "connected",
          os: null,
          serves: true,
          label: "This computer",
        },
      ],
      host: null,
      reachable: true,
      moving: null,
      error: null,
    },
    at: T0,
  },
  [`${STATE}/service/sent.json`]: {
    "abc12345-def67890": { at: T0, result: { ok: true, at: T0 } },
  },
  [`${STATE}/service/usage.jsonl`]: [
    {
      at: T0,
      kind: "view",
      from: "web",
      view: "task",
      space: "sp1",
      task: "widgets#1",
      tab: "chat",
      ms: 1200,
    },
    {
      at: T0,
      kind: "error",
      artifact: "art-1",
      section: "agents",
      type: "accept",
      key: "tasks.merge",
      n: 2,
      status: 500,
    },
  ],
  [`${STATE}/cli-check.json`]: {
    at: T0,
    machines: {
      "": { claude: "ready", codex: null, at: T0 },
      "vm-b": { claude: "signed-out", codex: "missing", at: T0, failed: T0 },
    },
  },
  [`${STATE}/codex-sandbox.json`]: {
    key: {
      codex: "/example-bin/codex",
      codex_at: "1000:1800000000",
      bwrap: "/example-bin/bwrap",
      bwrap_at: null,
      userns: "1",
      profile: null,
      limits: ["15000", null],
    },
    at: 1_800_000_000.5,
    broken: {
      error: "bwrap: example refusal",
      bwrap: "/example-bin/bwrap",
      userns: true,
      at: 1_800_000_000,
    },
  },
  [`${STATE}/migrate.json`]: {
    started: T0,
    kinds: { tasks: "moved", "model-picks": "kept", settings: "swapped" },
    backups: { settings: "/example-home/.herdr/shepherdr.json.pre-layout2" },
    finished: T0,
    notes: ["example note"],
    cleaned: T0,
  },
  ".local/share/shepherdr/LAYOUT": 2,
  [`${HERDR_CORE}/docs.json`]: {
    "shepherdr.node": {
      value: { serving: true, name: "example-host" },
      version: 4,
    },
    "shepherdr.secrets": { value: {}, version: 1 },
    "herdr-app": { value: { spaces: [{ id: "sp1", name: "Widgets" }] } },
    "some.other.document": { value: 7, version: 1 },
  },
  [`${HERDR_CORE}/terminals.json`]: {
    next_id: 9,
    terminals: {
      t1: {
        address: "t1",
        name: null,
        state: "live",
        labels: { "herdr.role": "coordinator" },
        argv: ["claude"],
        cwd: "/example-home/widgets",
        pid: 4242,
        parent: null,
        template: "assistant",
        turn: 3,
        status: { state: "idle", app: "claude" },
        status_ms: null,
        foreground: { pid: 4250, name: "claude", argv: ["claude"], cwd: "/" },
        cols: 120,
      },
    },
  },
};

/** The text a file holds on disk: one JSON document, or one per line for a `.jsonl` log. */
export function fileText(path: string, content: unknown): string {
  if (!path.endsWith(".jsonl")) return `${JSON.stringify(content, null, 2)}\n`;
  const lines = Array.isArray(content) ? content : [content];
  return lines.map((line) => `${JSON.stringify(line)}\n`).join("");
}
