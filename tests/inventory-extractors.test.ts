import { expect, test } from "bun:test";
import { Schema } from "effect";
import { coreRpcMethods } from "../src/domains/inventory/core-rpc-methods.ts";
import { diagramElements } from "../src/domains/inventory/diagram-elements.ts";
import { hcCliSubcommands } from "../src/domains/inventory/hc-cli-subcommands.ts";
import { herdrTaskCommands } from "../src/domains/inventory/herdr-task-commands.ts";
import { lists } from "../src/domains/inventory/lists.ts";
import { serviceActions } from "../src/domains/inventory/service-actions.ts";
import { serviceRoutes } from "../src/domains/inventory/service-routes.ts";
import { stateFileItems } from "../src/domains/inventory/state-files.ts";
import { terminalLabels } from "../src/domains/inventory/terminal-labels.ts";
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
  sources,
} from "./inventory-fixtures.ts";

test("herdr-task commands: helpers, nested verbs and hidden ones are all found, each once", () => {
  const command = (id: string, piece: string, hidden = false) => ({
    id,
    kind: "herdr-task-command" as const,
    source: at(CLI, piece),
    hidden,
  });

  expect(herdrTaskCommands(file(CLI))).toEqual([
    // No help text: argparse leaves it out of the list it prints.
    command("_allow", 'sub.add_parser("_allow")', true),
    // Acted on before argparse runs, so nothing registers it.
    command("_job", '["_job"]', true),
    command("auto", 'sub.add_parser("auto"'),
    // Added through a helper to a group whose call ends on the next line.
    command("auto add", 'auto_cmd("add"'),
    command("auto run-now", 'auto_cmd("run-now"'),
    command("home", 'sub.add_parser("home"'),
    command("home report", 'hs.add_parser("report")', true),
    command("home show", 'hs.add_parser("show"'),
    command("list", 'cmd("list"'),
    command("review", 'sub.add_parser("review")', true),
    // Compared before argparse and registered: listed as registered.
    command("tick", 'cmd("tick"'),
    command("where", 'cmd("where"'),
  ]);
});

test("service routes: exact, prefix and pattern paths, with their methods and WebSocket upgrades", () => {
  const route = (id: string, piece: string, more: object = {}) => ({
    id,
    kind: "service-route" as const,
    source: at(MAIN, piece),
    websocket: false,
    ...more,
  });

  expect(serviceRoutes(file(MAIN))).toEqual([
    route("/^\\/api\\/files\\/([\\w.-]+)$/", ".exec(path)"),
    route("/api/*", 'path.startsWith("/api/")'),
    // Its method is read inside the handler, not beside the path.
    route("/api/find", 'path === "/api/find"'),
    route("/api/health", 'path === "/api/health"'),
    route("/api/push/*", 'path.startsWith("/api/push/")', {
      methods: ["POST"],
    }),
    // Inside the block the POST check guards.
    route("/api/push/test", 'path === "/api/push/test"', {
      methods: ["POST"],
    }),
    route("/api/state", 'path === "/api/state"', { methods: ["GET", "POST"] }),
    route("/api/terminal", 'path === "/api/terminal"', { websocket: true }),
    // Upgraded through a flag set where the path is compared.
    route("/api/ws", 'path === "/api/ws"', { websocket: true }),
    route("/mount/*", 'pathname.startsWith("/mount/")'),
  ]);
});

test("service actions: both handlers' compared and switched types, and no other function's", () => {
  const action = (id: string, path: string, piece: string) => ({
    id,
    kind: "service-action" as const,
    source: at(path, piece),
    handler: path === MAIN ? ("main.ts" as const) : ("actions.ts" as const),
  });

  expect(serviceActions([file(ACTIONS), file(MAIN)])).toEqual([
    action("answer", ACTIONS, '"answer"'),
    action("close", ACTIONS, 'case "close"'),
    action("delete", ACTIONS, 'case "delete"'),
    // Handled in both files: listed for each.
    action("mode@actions.ts", ACTIONS, '"mode"'),
    action("mode@main.ts", MAIN, '"mode"'),
    action("send", ACTIONS, 'case "send"'),
    action("setting", MAIN, '"setting"'),
    action("tab-close", ACTIONS, '"tab-close"'),
    action("tab-move", ACTIONS, '"tab-move"'),
    action("usage", MAIN, '"usage"'),
  ]);
});

test("core RPC methods: the required list and every call by name, marked for each", () => {
  const method = (
    id: string,
    path: string,
    piece: string,
    required: boolean,
    called: boolean,
  ) => ({
    id,
    kind: "core-rpc-method" as const,
    source: at(path, piece),
    required,
    called,
  });

  expect(coreRpcMethods([file(ACTIONS), file(HUB), file(CLIENT)])).toEqual([
    method("doc.get", CLIENT, "'doc.get'", true, true),
    // On the list's second line.
    method("events.subscribe", CLIENT, "'events.subscribe'", true, true),
    method("hello", CLIENT, "'hello'", false, true),
    // The client refuses a core without it, and nothing calls it.
    method("terminal.run", CLIENT, "'terminal.run'", true, false),
    method("terminal.send", CLIENT, "'terminal.send'", true, true),
  ]);
});

test("hc subcommands: every way a command line is built, with who runs each", () => {
  const subcommand = (
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

  expect(hcCliSubcommands([file(AGENTS), file(ACTIONS), file(CLIENT)])).toEqual(
    [
      subcommand("connect", CLIENT, "spawn(endpoint.binary"),
      subcommand("file write", AGENTS, '["hc", "file", "write"'),
      subcommand("get", AGENTS, 'hc_json("get"'),
      subcommand("keys", ACTIONS, 'hc(["keys"'),
      subcommand("label", ACTIONS, 'hc(["label"'),
      subcommand("machine ls", AGENTS, 'hc_json("machine", "ls")', [
        AGENTS,
        ACTIONS,
      ]),
      subcommand("read", ACTIONS, 'this.hc(["read"'),
      subcommand("send", AGENTS, '["hc", "send"'),
      // Inside a script the file keeps as a string, run through a variable.
      subcommand("server status", AGENTS, '[hc, "server", "status"'),
    ],
  );
});

test("terminal labels: each name once, with the files that write it", () => {
  const label = (id: string, path: string, piece: string, files = [path]) => ({
    id,
    kind: "terminal-label" as const,
    source: at(path, piece),
    files,
  });

  expect(terminalLabels([file(AGENTS), file(ACTIONS), file(SECRETS)])).toEqual([
    label("herdr.chat", ACTIONS, "`herdr.chat="),
    label("herdr.chat.read", ACTIONS, '"herdr.chat.read"'),
    label("herdr.role", AGENTS, "'herdr.role'"),
    // A prefix: the code adds a name after it.
    label("herdr.secret.ask.*", SECRETS, '"herdr.secret.ask."'),
    label("herdr.space", AGENTS, '"herdr.space='),
    label("herdr.task", AGENTS, '"herdr.task"', [SECRETS, AGENTS]),
  ]);
});

test("diagram elements: boxes by id, arrows by their ends, numbered when two boxes have more than one", () => {
  const diagram = { path: DIAGRAM, text: diagramText };
  const element = (
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

  expect(diagramElements(diagram)).toEqual([
    element("doc", "box", "Shared documents", "ContainerDb_Ext(doc"),
    element("files", "box", "Saved files", "ContainerDb(files"),
    element("net", "box", "Tailscale", "System_Ext(net"),
    element("net->svc", "arrow", "Proxies", "Rel(net, svc"),
    // A comma inside the quotes is part of the label.
    element("pb", "box", "Person, in a browser", "Person(pb"),
    element("pb->net", "arrow", "Opens, over HTTPS", "Rel(pb, net"),
    element("svc", "box", "Service", "Container(svc"),
    element("svc->doc", "arrow", "doc.get", "Rel(svc, doc"),
    element("svc->files#1", "arrow", "Reads", 'Rel(svc, files, "Reads"'),
    element("svc->files#2", "arrow", "Writes", 'Rel(svc, files, "Writes"'),
  ]);
});

test("the lists are the seven named ones, and each reads through its own schema only in id order", () => {
  expect(lists.map(({ name }) => name)).toEqual([
    "herdr-task-commands",
    "service-routes",
    "service-actions",
    "core-rpc-methods",
    "hc-cli-subcommands",
    "terminal-labels",
    "diagram-elements",
  ]);
  for (const list of lists) {
    const items = list.extract(sources);
    const read = Schema.decodeUnknownSync(list.schema);

    expect(read(items)).toEqual(items);
    expect(() => read([...items].reverse())).toThrow();
    // The same id twice.
    expect(() => read([...items, ...items.slice(-1)])).toThrow();
  }
});

test("a file whose brackets do not pair up is refused by name, not read short", () => {
  const broken = { path: MAIN, text: "const handlers = { fetch(req) {\n" };

  expect(() => serviceRoutes(broken)).toThrow(`${MAIN}:1`);
});

test("state files come from the registry: one item for each entry, each id once", () => {
  const items = stateFileItems();
  const ids = items.map(({ id }) => id);

  expect(ids).toContain(".local/share/shepherdr/tasks/.launches.json");
  // The task lists match by pattern, and are named by it.
  expect(ids).toContain(
    "^\\.local\\/share\\/shepherdr\\/tasks\\/[^/]+\\.json$",
  );
  expect(new Set(ids).size).toBe(stateFiles.length);
  expect(ids).toEqual([...ids].sort());
  expect(new Set(items.map(({ kind }) => kind))).toEqual(
    new Set(["state-file"]),
  );
});
