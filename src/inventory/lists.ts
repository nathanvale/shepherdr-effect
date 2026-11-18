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
import { fileAt, type Item, type SourceFile } from "./source.ts";
import { TerminalLabel, terminalLabels } from "./terminal-labels.ts";

/** The old system's source text, by where it lives, and this repository's copy of its diagram. */
export interface Sources {
  /** `mods/tasks/bin/herdr_task/*.py` */
  readonly python: readonly SourceFile[];
  /** `service/*.ts` and `service/hc/*.ts`, tests left out */
  readonly service: readonly SourceFile[];
  /** `core/*.js`, tests left out */
  readonly coreFolder: readonly SourceFile[];
  readonly diagram: SourceFile;
}

export interface List {
  /** The list's name, and its file's: `inventory/<name>.json`. */
  readonly name: string;
  /** The list as its file holds it. */
  readonly schema: Schema.Codec<readonly Item[], unknown>;
  extract(sources: Sources): readonly Item[];
}

function inOrder(items: readonly Item[], at: number): boolean {
  const before = items[at - 1];
  const here = items[at];
  return before === undefined || here === undefined || before.id < here.id;
}

/** A list of one kind of item, in id order, each id once. */
function listOf<S extends Schema.Codec<Item, unknown>>(item: S) {
  return Schema.Array(item).check(
    Schema.makeFilter((items) => items.every((_, at) => inOrder(items, at)), {
      expected: "items in id order, each id once",
    }),
  );
}

const CLI = "mods/tasks/bin/herdr_task/cli.py";
const MAIN = "service/main.ts";

/**
 * Every list the inventory keeps as a file, in the order they are reported.
 * State files are not here: `src/state-files/registry.ts` is their one list.
 */
export const lists: readonly List[] = [
  {
    name: "herdr-task-commands",
    schema: listOf(HerdrTaskCommand),
    extract: ({ python }) => herdrTaskCommands(fileAt(python, CLI)),
  },
  {
    name: "service-routes",
    schema: listOf(ServiceRoute),
    extract: ({ service }) => serviceRoutes(fileAt(service, MAIN)),
  },
  {
    name: "service-actions",
    schema: listOf(ServiceAction),
    extract: ({ service }) => serviceActions(service),
  },
  {
    name: "herdr-core-rpc-methods",
    schema: listOf(HerdrCoreRpcMethod),
    extract: ({ service }) => herdrCoreRpcMethods(service),
  },
  {
    name: "hc-cli-subcommands",
    schema: listOf(HcCliSubcommand),
    extract: ({ python, service }) => hcCliSubcommands([...python, ...service]),
  },
  {
    name: "terminal-labels",
    schema: listOf(TerminalLabel),
    extract: ({ python, service, coreFolder }) =>
      terminalLabels([...python, ...service, ...coreFolder]),
  },
  {
    name: "diagram-elements",
    schema: listOf(DiagramElement),
    extract: ({ diagram }) => diagramElements(diagram),
  },
];
