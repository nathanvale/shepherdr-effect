import type { Sources } from "../src/domains/inventory/lists.ts";

/**
 * A small made-up fork: each file holds the shapes one extractor must read,
 * with the cases that are easy to get wrong. None of it is the real fork's text.
 */

export const CLI = "mods/tasks/bin/herdr_task/cli.py";
export const AGENTS = "mods/tasks/bin/herdr_task/agents.py";
export const MAIN = "service/main.ts";
export const ACTIONS = "service/actions.ts";
export const HUB = "service/hub.ts";
export const CLIENT = "service/hc/client.ts";
export const SECRETS = "core/secrets.js";
export const DIAGRAM = "docs/design/current-architecture.mmd";

const cli = `"""The command line."""
import argparse


def main():
    argv = sys.argv[1:]
    if argv[:1] == ["--on"] and len(argv) > 1:
        return remote(argv[1], argv[2:])
    if argv[:1] == ["_job"]:
        return follow(argv)
    if argv[:1] == ["tick"]:
        argv = [*argv, "--machine", name]
    p = argparse.ArgumentParser(prog="tool", description="A tool (its words hold a bracket")
    sub = p.add_subparsers(dest="cmd")

    def cmd(name, fn, help, id=True):
        c = sub.add_parser(name, help=help)
        c.set_defaults(fn=fn)
        return c

    cmd("where", cmd_where, "the folder's place", id=False)
    c = cmd("list", cmd_list, "list tasks: sub.add_parser(\\"quoted\\") is only words here")
    c.add_argument("--all", action="store_true")
    # sub.add_parser("commented")
    cmd("tick", cmd_tick, "start what can go")
    c = sub.add_parser("review")  # kept for old callers
    c = sub.add_parser("_allow")
    au = sub.add_parser("auto", help="automations (a time"
                        " or an event").add_subparsers(dest="auto")

    def auto_cmd(name, help, id=True):
        c = au.add_parser(name, help=help)
        return c

    auto_cmd("add", "add one")
    auto_cmd("run-now", "run it now")
    ho = sub.add_parser("home", help="a machine's home")
    hs = ho.add_subparsers(dest="home")
    c = hs.add_parser("show", help="show it")
    c = hs.add_parser("report")
`;

const agents = `import subprocess

LABEL = "herdr.task"
NODE_DOC = "shepherdr.node"


def look(address, text):
    # its herdr.comment label is only named here
    r = run(["hc", "send", address, text])
    k = hc_json("get", address)
    machines = hc_json("machine", "ls")
    subprocess.run(["hc", "file", "write", "--on", machine, target], input=body)
    r = run(["hc", *hc_args])
    guard(["hc"])
    subprocess.run(["hc", verb, k["address"]])
    space = f"herdr.space={sp['id']}"
    return f"{labels['herdr.role']}" + (k.get("labels") or {}).get("herdr.task")


SCRIPT = '''
hc = shutil.which("hc")
core = js(sh([hc, "server", "status", "--json"]))
'''
`;

const main = `import { act } from "./actions.ts";

async function doAction(body: any): Promise<Response> {
  if (body?.type === "setting" && body.key === "notify") return json({ ok: true });
  if (body?.type === "setting" && typeof body.key === "string") return json({ ok: true });
  if (body?.type === "usage") return json({ ok: true });
  const r = await act(hub, body, compat);
  if (body?.type === "mode") await refresh();
  return json(r);
}

const io = {
  read: (source: string) => {
    switch (source) { case "insights": return 1; }
    return doAction({ type: "evidence" });
  },
};

function other(a: { path: string }) {
  const path = String(a.path);
  if (path === "/not/a/route") return 1;
  if (/secret$/.test(path)) throw new Error("no");
  return 2 / 1;
}

const handlers = {
  async fetch(req: Request, srv: Server) {
    const url = new URL(req.url);
    const path = url.pathname.startsWith("/mount/") ? url.pathname.slice(6) : url.pathname;
    if (path === "/api/health") return json({ ok: true });
    if (form.path === "/a/field/of/something/else") return json({});
    const socket = path === "/api/ws" || path === "/api/terminal";
    if (path === "/api/terminal") {
      return srv.upgrade(req, { data: {} }) ? undefined : new Response("no", { status: 400 });
    }
    if (socket) return srv.upgrade(req) ? undefined : new Response("no");
    if (path === "/api/state" && req.method === "GET") return json(state);
    if (path === "/api/state" && req.method === "POST") { return json(await save()); }
    if (path.startsWith("/api/push/") && req.method === "POST") {
      if (path === "/api/push/test") return json(await test());
    }
    const art = /^\\/api\\/files\\/([\\w.-]+)$/.exec(path);
    if (art) return file(art[1], \`x-\${name.replace(/"/g, "")}-\${on ? \`, \${on}\` : ""}\`);
    if (path === "/api/find") return json(await find(req.method === "POST"));
    // if (path === "/api/commented") return gone();
    if (path.startsWith("/api/")) return json({ error: "not found" }, 404);
    return file(path);
  },
};
`;

const actions = `export const hc = (args: string[]) => run([process.env.SHEPHERDR_HC || "hc", ...args]);

export async function act(hub: Hub, b: any, compat: Compat): Promise<unknown> {
  if (b?.type === "answer" && typeof b.question === "string") return answer(b);
  if ((b?.type === "tab-close" || b?.type === "tab-move") && typeof b.tab === "string") {
    if (b.type === "tab-move") return hc(["keys", b.tab, "esc", "esc"]);
  }
  if (b?.type === "mode") return mode(b);
  for (const item of items) if (item.type === "text") skip(item);
  const ms = await run([process.env.SHEPHERDR_HC || "hc", "machine", "ls", "--json"]);
  switch (b?.type) {
    case "send": {
      switch (b.how) { case "inner": break; }
      return hub.call<{ ok: boolean; at: number }>("terminal.send", { terminal: b.chat, text: b.text });
    }
    case "close": case "delete": return this.hc(["read", t.labels?.["herdr.chat.read"]]);
  }
  await hc(["label", b.chat, \`herdr.chat=\${pane}\`]);
  throw new Error("Not here: https://herdr.dev says why.");
}

function elsewhere(b: any) {
  if (b?.type === "outside") return ["agents", "hc", "home"];
}
`;

const client = `const REQUIRED = ['terminal.run', 'terminal.send', 'doc.get',
  'events.subscribe']

export class CoreClient {
  static async endpoint(endpoint: CoreEndpoint) {
    const child = spawn(endpoint.binary, ['connect'], { env })
    const hello = await client.call<CoreHello>('hello', { generation: 1, framed: true })
    return hello
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.write(method, params)
  }

  async subscribe() {
    return this.call<CoreSnapshot>('events.subscribe', {}, 15_000, snapshot => {})
  }
}
`;

const hub = `export class Hub {
  async call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return (await this.core()).call<T>(method, params);
  }
  doc(name: string) {
    return this.call<{ value: any; version: number }>("doc.get", { name }, 8000);
  }
}
`;

const secrets = `// Which label an agent's ask goes under.
export const ASK = "herdr.secret.ask.";
export const TASK = "herdr.task";
`;

const diagram = `%% A made-up diagram.
C4Container
title Parts and seams

Person(pb, "Person, in a browser", "Phone or desktop")
System_Ext(net, "Tailscale", "proc: tailscaled")
System_Boundary(shep, "The install") {
  Container(svc, "Service", "Bun", "service/main.ts")
  ContainerDb(files, "Saved files", "JSON", "tasks/*.json")
}
ContainerDb_Ext(doc, "Shared documents", "herdr-core docs", "shepherdr")

Rel(pb, net, "Opens, over HTTPS", "service/main.ts:3")
Rel(net, svc, "Proxies", "service/tailscale.ts:126")
Rel(svc, files, "Reads", "service/store.ts:13")
Rel(svc, files, "Writes", "service/store.ts:45")
Rel(svc, doc, "doc.get", "service/host.ts:123")

UpdateElementStyle(svc, $borderColor="#b45309")
`;

/** The fork's files, by path from its root. */
export const forkFiles: Readonly<Record<string, string>> = {
  [CLI]: cli,
  [AGENTS]: agents,
  [MAIN]: main,
  [ACTIONS]: actions,
  [HUB]: hub,
  // A test file is never read: what it names must not reach a list.
  "service/hub.test.ts": `await hub.call("test.only", {}); const l = "herdr.testonly";`,
  [CLIENT]: client,
  [SECRETS]: secrets,
  "core/secrets.test.js": `const l = "herdr.testonly";`,
};

export const diagramText = diagram;

/** One of the fork's files as an extractor takes it. */
export function file(path: string) {
  const text = forkFiles[path];
  if (text === undefined) throw new Error(`The fixture has no ${path}`);
  return { path, text };
}

/** Where a piece of text first stands in a file, as an item's `source` says it. The first line is 1. */
export function at(path: string, piece: string, text = file(path).text) {
  const index = text.indexOf(piece);
  if (index < 0) throw new Error(`${path} does not hold ${piece}`);
  return `${path}:${String(text.slice(0, index).split("\n").length)}`;
}

/** The fork as its reader hands it over: tests left out, the service's own files before its core link's. */
export const sources: Sources = {
  python: [file(AGENTS), file(CLI)],
  service: [file(ACTIONS), file(HUB), file(MAIN), file(CLIENT)],
  core: [file(SECRETS)],
  diagram: { path: DIAGRAM, text: diagramText },
};
