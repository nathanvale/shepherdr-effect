import { Schema } from "effect";
import {
  HerdrCoreRpcMethod,
  herdrCoreRpcMethods,
} from "./herdr-core-rpc-methods.ts";
import { DiagramElement, diagramElements } from "./diagram-elements.ts";
import { HcCliSubcommand, hcCliSubcommands } from "./hc-cli-subcommands.ts";
import { HerdrTaskCommand, herdrTaskCommands } from "./herdr-task-commands.ts";
import { ServiceAction, serviceActions } from "./service-actions.ts";
import { ServiceRoute, serviceRoutes } from "./service-routes.ts";
import { fileAtOrThrow, type Item, type SourceFile } from "./source.ts";
import { TerminalLabel, terminalLabels } from "./terminal-labels.ts";

export interface Sources {
  readonly python: readonly SourceFile[];
  readonly service: readonly SourceFile[];
  readonly coreFolder: readonly SourceFile[];
  readonly diagram: SourceFile;
}

export interface List {
  readonly name: string;
  readonly fileSchema: Schema.Codec<readonly Item[], unknown>;
  extract(sources: Sources): readonly Item[];
}

function inOrder(items: readonly Item[], at: number): boolean {
  const before = items[at - 1];
  const here = items[at];
  return before === undefined || here === undefined || before.id < here.id;
}

function idOrderedListOf<S extends Schema.Codec<Item, unknown>>(item: S) {
  return Schema.Array(item).check(
    Schema.makeFilter((items) => items.every((_, at) => inOrder(items, at)), {
      expected: "items in id order, each id once",
    }),
  );
}

const CLI = "mods/tasks/bin/herdr_task/cli.py";
const MAIN = "service/main.ts";

export const listsKeptAsFiles: readonly List[] = [
  {
    name: "herdr-task-commands",
    fileSchema: idOrderedListOf(HerdrTaskCommand),
    extract: ({ python }) => herdrTaskCommands(fileAtOrThrow(python, CLI)),
  },
  {
    name: "service-routes",
    fileSchema: idOrderedListOf(ServiceRoute),
    extract: ({ service }) => serviceRoutes(fileAtOrThrow(service, MAIN)),
  },
  {
    name: "service-actions",
    fileSchema: idOrderedListOf(ServiceAction),
    extract: ({ service }) => serviceActions(service),
  },
  {
    name: "herdr-core-rpc-methods",
    fileSchema: idOrderedListOf(HerdrCoreRpcMethod),
    extract: ({ service }) => herdrCoreRpcMethods(service),
  },
  {
    name: "hc-cli-subcommands",
    fileSchema: idOrderedListOf(HcCliSubcommand),
    extract: ({ python, service }) => hcCliSubcommands([...python, ...service]),
  },
  {
    name: "terminal-labels",
    fileSchema: idOrderedListOf(TerminalLabel),
    extract: ({ python, service, coreFolder }) =>
      terminalLabels([...python, ...service, ...coreFolder]),
  },
  {
    name: "diagram-elements",
    fileSchema: idOrderedListOf(DiagramElement),
    extract: ({ diagram }) => diagramElements(diagram),
  },
];
