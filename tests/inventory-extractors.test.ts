import { expect, test } from "bun:test";
import { Schema } from "effect";
import { herdrCoreRpcMethods } from "../src/inventory/herdr-core-rpc-methods.ts";
import { diagramElements } from "../src/inventory/diagram-elements.ts";
import { hcCliSubcommands } from "../src/inventory/hc-cli-subcommands.ts";
import { herdrTaskCommands } from "../src/inventory/herdr-task-commands.ts";
import { listsKeptAsFiles } from "../src/inventory/lists.ts";
import { serviceActions } from "../src/inventory/service-actions.ts";
import { serviceRoutes } from "../src/inventory/service-routes.ts";
import { stateFileItemsFromRegistry } from "../src/inventory/state-files.ts";
import { terminalLabels } from "../src/inventory/terminal-labels.ts";
import { stateFiles } from "../src/state-files/registry.ts";
import {
  ACTIONS,
  AGENTS,
  at,
  CLI,
  CLIENT,
  DIAGRAM,
  diagramText,
  file,
  HUB,
  MAIN,
  SECRETS,
  sourcesAsRead,
} from "./inventory-fixtures.ts";

const taskCommand = (id: string, piece: string, hidden = false) => ({
  id,
  kind: "herdr-task-command" as const,
  source: at(CLI, piece),
  hidden,
});

test("herdr-task commands: helpers, nested verbs and hidden ones are all found, each once", () => {
  expect(herdrTaskCommands(file(CLI))).toEqual([
    taskCommand("_allow", 'sub.add_parser("_allow")', true),
    taskCommand("_job", '["_job"]', true),
    taskCommand("auto", 'sub.add_parser("auto"'),
    taskCommand("auto add", 'auto_cmd("add"'),
    taskCommand("auto run-now", 'auto_cmd("run-now"'),
    taskCommand("home", 'sub.add_parser("home"'),
    taskCommand("home report", 'hs.add_parser("report")', true),
    taskCommand("home show", 'hs.add_parser("show"'),
    taskCommand("list", 'cmd("list"'),
    taskCommand("review", 'sub.add_parser("review")', true),
    taskCommand("tick", 'cmd("tick"'),
    taskCommand("where", 'cmd("where"'),
  ]);
});

test("herdr-task commands: a command with no help text is listed as hidden, because argparse leaves it out of the list it prints", () => {
  expect(herdrTaskCommands(file(CLI))).toContainEqual(
    taskCommand("_allow", 'sub.add_parser("_allow")', true),
  );
});

test("herdr-task commands: a command acted on before argparse runs is listed as hidden, because nothing registers it", () => {
  expect(herdrTaskCommands(file(CLI))).toContainEqual(
    taskCommand("_job", '["_job"]', true),
  );
});

test("herdr-task commands: a verb added through a helper to a group whose call ends on the next line is found", () => {
  const commands = herdrTaskCommands(file(CLI));

  expect(commands).toContainEqual(taskCommand("auto add", 'auto_cmd("add"'));
  expect(commands).toContainEqual(
    taskCommand("auto run-now", 'auto_cmd("run-now"'),
  );
});

test("herdr-task commands: a command compared before argparse and also registered is listed as registered", () => {
  expect(herdrTaskCommands(file(CLI))).toContainEqual(
    taskCommand("tick", 'cmd("tick"'),
  );
});

const serviceRoute = (id: string, piece: string, more: object = {}) => ({
  id,
  kind: "service-route" as const,
  source: at(MAIN, piece),
  websocket: false,
  ...more,
});

test("service routes: exact, prefix and pattern paths, with their methods and WebSocket upgrades", () => {
  expect(serviceRoutes(file(MAIN))).toEqual([
    serviceRoute("/^\\/api\\/files\\/([\\w.-]+)$/", ".exec(path)"),
    serviceRoute("/api/*", 'path.startsWith("/api/")'),
    serviceRoute("/api/find", 'path === "/api/find"'),
    serviceRoute("/api/health", 'path === "/api/health"'),
    serviceRoute("/api/push/*", 'path.startsWith("/api/push/")', {
      methods: ["POST"],
    }),
    serviceRoute("/api/push/test", 'path === "/api/push/test"', {
      methods: ["POST"],
    }),
    serviceRoute("/api/state", 'path === "/api/state"', {
      methods: ["GET", "POST"],
    }),
    serviceRoute("/api/terminal", 'path === "/api/terminal"', {
      websocket: true,
    }),
    serviceRoute("/api/ws", 'path === "/api/ws"', { websocket: true }),
    serviceRoute("/mount/*", 'pathname.startsWith("/mount/")'),
  ]);
});

test("service routes: a route whose method is read inside the handler, not beside the path, lists no method", () => {
  expect(serviceRoutes(file(MAIN))).toContainEqual(
    serviceRoute("/api/find", 'path === "/api/find"'),
  );
});

test("service routes: a route inside the block a POST check guards lists POST", () => {
  expect(serviceRoutes(file(MAIN))).toContainEqual(
    serviceRoute("/api/push/test", 'path === "/api/push/test"', {
      methods: ["POST"],
    }),
  );
});

test("service routes: a route upgraded through a flag set where the path is compared is a WebSocket", () => {
  expect(serviceRoutes(file(MAIN))).toContainEqual(
    serviceRoute("/api/ws", 'path === "/api/ws"', { websocket: true }),
  );
});

const serviceAction = (id: string, path: string, piece: string) => ({
  id,
  kind: "service-action" as const,
  source: at(path, piece),
  handler: path === MAIN ? ("main.ts" as const) : ("actions.ts" as const),
});

test("service actions: both handlers' compared and switched types, and no other function's", () => {
  expect(serviceActions([file(ACTIONS), file(MAIN)])).toEqual([
    serviceAction("answer", ACTIONS, '"answer"'),
    serviceAction("close", ACTIONS, 'case "close"'),
    serviceAction("delete", ACTIONS, 'case "delete"'),
    serviceAction("mode@actions.ts", ACTIONS, '"mode"'),
    serviceAction("mode@main.ts", MAIN, '"mode"'),
    serviceAction("send", ACTIONS, 'case "send"'),
    serviceAction("setting", MAIN, '"setting"'),
    serviceAction("tab-close", ACTIONS, '"tab-close"'),
    serviceAction("tab-move", ACTIONS, '"tab-move"'),
    serviceAction("usage", MAIN, '"usage"'),
  ]);
});

test("service actions: a type handled in both files is listed for each", () => {
  const actions = serviceActions([file(ACTIONS), file(MAIN)]);

  expect(actions).toContainEqual(
    serviceAction("mode@actions.ts", ACTIONS, '"mode"'),
  );
  expect(actions).toContainEqual(serviceAction("mode@main.ts", MAIN, '"mode"'));
});

const rpcMethod = (
  id: string,
  path: string,
  piece: string,
  required: boolean,
  called: boolean,
) => ({
  id,
  kind: "herdr-core-rpc-method" as const,
  source: at(path, piece),
  required,
  called,
});

test("herdr-core RPC methods: the required list and every call by name, marked for each", () => {
  expect(herdrCoreRpcMethods([file(ACTIONS), file(HUB), file(CLIENT)])).toEqual(
    [
      rpcMethod("doc.get", CLIENT, "'doc.get'", true, true),
      rpcMethod("events.subscribe", CLIENT, "'events.subscribe'", true, true),
      rpcMethod("hello", CLIENT, "'hello'", false, true),
      rpcMethod("terminal.run", CLIENT, "'terminal.run'", true, false),
      rpcMethod("terminal.send", CLIENT, "'terminal.send'", true, true),
    ],
  );
});

test("herdr-core RPC methods: a method on the required list's second line is found", () => {
  expect(
    herdrCoreRpcMethods([file(ACTIONS), file(HUB), file(CLIENT)]),
  ).toContainEqual(
    rpcMethod("events.subscribe", CLIENT, "'events.subscribe'", true, true),
  );
});

test("herdr-core RPC methods: a method the client requires and nothing calls is marked required and not called", () => {
  expect(
    herdrCoreRpcMethods([file(ACTIONS), file(HUB), file(CLIENT)]),
  ).toContainEqual(
    rpcMethod("terminal.run", CLIENT, "'terminal.run'", true, false),
  );
});

const hcSubcommand = (
  id: string,
  path: string,
  piece: string,
  callers = [path],
) => ({
  id,
  kind: "hc-cli-subcommand" as const,
  source: at(path, piece),
  callers,
});

test("hc subcommands: every way a command line is built, with who runs each", () => {
  expect(hcCliSubcommands([file(AGENTS), file(ACTIONS), file(CLIENT)])).toEqual(
    [
      hcSubcommand("connect", CLIENT, "spawn(endpoint.binary"),
      hcSubcommand("file write", AGENTS, '["hc", "file", "write"'),
      hcSubcommand("get", AGENTS, 'hc_json("get"'),
      hcSubcommand("keys", ACTIONS, 'hc(["keys"'),
      hcSubcommand("label", ACTIONS, 'hc(["label"'),
      hcSubcommand("machine ls", AGENTS, 'hc_json("machine", "ls")', [
        AGENTS,
        ACTIONS,
      ]),
      hcSubcommand("read", ACTIONS, 'this.hc(["read"'),
      hcSubcommand("send", AGENTS, '["hc", "send"'),
      hcSubcommand("server status", AGENTS, '[hc, "server", "status"'),
    ],
  );
});

test("hc subcommands: a command inside a script the file keeps as a string, run through a variable, is found", () => {
  expect(
    hcCliSubcommands([file(AGENTS), file(ACTIONS), file(CLIENT)]),
  ).toContainEqual(
    hcSubcommand("server status", AGENTS, '[hc, "server", "status"'),
  );
});

const terminalLabel = (
  id: string,
  path: string,
  piece: string,
  files = [path],
) => ({
  id,
  kind: "terminal-label" as const,
  source: at(path, piece),
  files,
});

test("terminal labels: each name once, with the files that write it", () => {
  expect(terminalLabels([file(AGENTS), file(ACTIONS), file(SECRETS)])).toEqual([
    terminalLabel("herdr.chat", ACTIONS, "`herdr.chat="),
    terminalLabel("herdr.chat.read", ACTIONS, '"herdr.chat.read"'),
    terminalLabel("herdr.role", AGENTS, "'herdr.role'"),
    terminalLabel("herdr.secret.ask.*", SECRETS, '"herdr.secret.ask."'),
    terminalLabel("herdr.space", AGENTS, '"herdr.space='),
    terminalLabel("herdr.task", AGENTS, '"herdr.task"', [SECRETS, AGENTS]),
  ]);
});

test("terminal labels: a prefix the code adds a name after is listed with a star", () => {
  expect(
    terminalLabels([file(AGENTS), file(ACTIONS), file(SECRETS)]),
  ).toContainEqual(
    terminalLabel("herdr.secret.ask.*", SECRETS, '"herdr.secret.ask."'),
  );
});

const diagramElement = (
  id: string,
  kind: "box" | "arrow",
  label: string,
  piece: string,
) => ({
  id,
  kind: "diagram-element" as const,
  source: at(DIAGRAM, piece, diagramText),
  element: kind,
  label,
});

test("diagram elements: boxes by id, arrows by their ends, numbered when two boxes have more than one", () => {
  const diagram = { path: DIAGRAM, text: diagramText };

  expect(diagramElements(diagram)).toEqual([
    diagramElement("doc", "box", "Shared documents", "ContainerDb_Ext(doc"),
    diagramElement("files", "box", "Saved files", "ContainerDb(files"),
    diagramElement("net", "box", "Tailscale", "System_Ext(net"),
    diagramElement("net->svc", "arrow", "Proxies", "Rel(net, svc"),
    diagramElement("pb", "box", "Person, in a browser", "Person(pb"),
    diagramElement("pb->net", "arrow", "Opens, over HTTPS", "Rel(pb, net"),
    diagramElement("svc", "box", "Service", "Container(svc"),
    diagramElement("svc->doc", "arrow", "doc.get", "Rel(svc, doc"),
    diagramElement("svc->files#1", "arrow", "Reads", 'Rel(svc, files, "Reads"'),
    diagramElement(
      "svc->files#2",
      "arrow",
      "Writes",
      'Rel(svc, files, "Writes"',
    ),
  ]);
});

test("diagram elements: a comma inside the quotes is part of the label", () => {
  expect(diagramElements({ path: DIAGRAM, text: diagramText })).toContainEqual(
    diagramElement("pb", "box", "Person, in a browser", "Person(pb"),
  );
});

test("the lists are the seven named ones, and each reads through its own schema only in id order", () => {
  expect(listsKeptAsFiles.map(({ name }) => name)).toEqual([
    "herdr-task-commands",
    "service-routes",
    "service-actions",
    "herdr-core-rpc-methods",
    "hc-cli-subcommands",
    "terminal-labels",
    "diagram-elements",
  ]);
  for (const list of listsKeptAsFiles) {
    const items = list.extract(sourcesAsRead);
    const read = Schema.decodeUnknownSync(list.fileSchema);

    expect(read(items)).toEqual(items);
    expect(() => read([...items].reverse())).toThrow(
      "Expected items in id order, each id once",
    );
  }
});

test("each list's schema refuses an id given twice", () => {
  for (const list of listsKeptAsFiles) {
    const items = list.extract(sourcesAsRead);
    const read = Schema.decodeUnknownSync(list.fileSchema);

    expect(() => read([...items, ...items.slice(-1)])).toThrow(
      "Expected items in id order, each id once",
    );
  }
});

test("a file whose brackets do not pair up is refused by name, not read short", () => {
  const broken = { path: MAIN, text: "const handlers = { fetch(req) {\n" };

  expect(() => serviceRoutes(broken)).toThrow(`${MAIN}:1`);
});

test("state files come from the registry: one item for each entry, each id once", () => {
  const items = stateFileItemsFromRegistry();
  const ids = items.map(({ id }) => id);

  expect(ids).toContain(".local/share/shepherdr/tasks/.launches.json");
  expect(new Set(ids).size).toBe(stateFiles.length);
  expect(ids).toEqual([...ids].sort());
  expect(new Set(items.map(({ kind }) => kind))).toEqual(
    new Set(["state-file"]),
  );
});

test("state files come from the registry: the task lists match by pattern, and are named by it", () => {
  const ids = stateFileItemsFromRegistry().map(({ id }) => id);

  expect(ids).toContain(
    "^\\.local\\/share\\/shepherdr\\/tasks\\/[^/]+\\.json$",
  );
});
