import type { CommandDefinition } from "./commands-contract.ts";

export const commands: CommandDefinition[] = [
  {
    commandIdentity: "shepherdr.status",
    effectClass: "inspect",
    route: ["status"],
    summary: "Inspect the starter without changing data.",
    execute: async () => (await import("./domains/status.ts")).inspectStatus(),
    stations: () => [],
  },
  {
    commandIdentity: "shepherdr.template.info",
    effectClass: "inspect",
    route: ["template", "info"],
    summary: "Inspect the template convention.",
    execute: async () =>
      (await import("./domains/template.ts")).inspectTemplate(),
    stations: () => [],
  },
  {
    argumentUsage: "--dir PATH",
    commandIdentity: "shepherdr.state.check",
    effectClass: "inspect",
    route: ["state", "check"],
    summary:
      "Check that the state file schemas read a folder of state files and write them back unchanged.",
    execute: async (args) =>
      (await import("./state-files/handlers.ts")).checkStateFiles(args),
    stations: () => [],
  },
  {
    argumentUsage: "--fork PATH",
    commandIdentity: "shepherdr.inventory.extract",
    effectClass: "repository-local",
    route: ["inventory", "extract"],
    summary:
      "Read the old system's interface lists from its source and keep each as a file under inventory/ in the current folder.",
    execute: async (args) =>
      (await import("./inventory/handlers.ts")).extractInventory(args),
    stations: () => [],
  },
  {
    argumentUsage: "[--fork PATH]",
    commandIdentity: "shepherdr.inventory.check",
    effectClass: "inspect",
    route: ["inventory", "check"],
    summary:
      "Check that every file under inventory/ reads through its list's schema and, with --fork, still matches the old system's source.",
    execute: async (args) =>
      (await import("./inventory/handlers.ts")).checkInventory(args),
    stations: () => [],
  },
];
