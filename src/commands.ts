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
];
