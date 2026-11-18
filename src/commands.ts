import type { CommandDefinition } from "./commands-contract.ts";

export const commands: CommandDefinition[] = [
  {
    commandIdentity: "example.status",
    effectClass: "inspect",
    route: ["status"],
    summary: "Inspect the starter without changing data.",
    execute: async () => (await import("./domains/status.ts")).inspectStatus(),
    stations: () => [],
  },
  {
    commandIdentity: "example.template.info",
    effectClass: "inspect",
    route: ["template", "info"],
    summary: "Inspect the template convention.",
    execute: async () =>
      (await import("./domains/template.ts")).inspectTemplate(),
    stations: () => [],
  },
  {
    argumentUsage: "--dir PATH",
    commandIdentity: "example.state.check",
    effectClass: "inspect",
    route: ["state", "check"],
    summary:
      "Check that the state file schemas read a folder of state files and write them back unchanged.",
    execute: async (args) =>
      (await import("./domains/state-check.ts")).checkStateFiles(args),
    stations: () => [],
  },
];
