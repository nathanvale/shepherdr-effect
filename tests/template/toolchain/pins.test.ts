import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { testFolder } from "../../support/test-folder.ts";

const root = join(import.meta.dir, "../../..");
const sources = [
  { pattern: ".github/workflows/*.{yml,yaml}", composite: false },
  { pattern: ".github/actions/**/action.{yml,yaml}", composite: true },
];
const projects: string[] = [];

afterAll(() => {
  for (const project of projects) rmSync(project, { recursive: true });
});

type Step = { uses?: unknown; name?: unknown; id?: unknown; with?: unknown };
type SetupBun = {
  file: string;
  job: string;
  step: string;
  version: string | undefined;
  versionFile: boolean;
};

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : undefined;
}

function stepsOf(document: unknown, composite: boolean): [string, Step[]][] {
  const node = (document ?? {}) as {
    jobs?: Record<string, { steps?: Step[] }>;
    runs?: { steps?: Step[] };
  };
  if (composite) return [["composite action", node.runs?.steps ?? []]];
  return Object.entries(node.jobs ?? {}).map(([job, body]) => [
    job,
    body.steps ?? [],
  ]);
}

async function setupBunSteps(repository: string): Promise<SetupBun[]> {
  const found: SetupBun[] = [];
  for (const { pattern, composite } of sources) {
    const files = await Array.fromAsync(
      new Bun.Glob(pattern).scan({ cwd: repository, dot: true }),
    );
    for (const file of files.sort()) {
      const document = Bun.YAML.parse(
        await Bun.file(join(repository, file)).text(),
      );
      for (const [job, steps] of stepsOf(document, composite))
        steps.forEach((step, index) => {
          if (!scalar(step.uses)?.startsWith("oven-sh/setup-bun")) return;
          const inputs = (step.with ?? {}) as Record<string, unknown>;
          found.push({
            file,
            job,
            step: scalar(step.name) ?? scalar(step.id) ?? `#${index + 1}`,
            version: scalar(inputs["bun-version"]),
            versionFile: inputs["bun-version-file"] !== undefined,
          });
        });
    }
  }
  return found;
}

function problem(step: SetupBun, pin: string): string | undefined {
  const where = `${step.file} job ${step.job} step ${step.step}`;
  if (step.versionFile)
    return `${where} uses bun-version-file. Repair: set bun-version: ${pin} on that step.`;
  if (step.version === undefined)
    return `${where} has no bun-version. Repair: set bun-version: ${pin} on that step.`;
  if (step.version.includes("${{"))
    return `${where} sets bun-version from ${step.version}, which fails closed (a matrix value is not checked). Repair: set bun-version: ${pin} on that step.`;
  if (step.version !== pin)
    return `${where} sets bun-version ${step.version}, and package.json pins ${pin}. Repair: set bun-version: ${pin} on that step.`;
  return undefined;
}

async function pinProblems(repository: string): Promise<string[]> {
  const { packageManager } = (await Bun.file(
    join(repository, "package.json"),
  ).json()) as { packageManager?: unknown };
  const pin = /^bun@([^+]+)/.exec(String(packageManager))?.[1];
  if (pin === undefined)
    return [
      'package.json has no toolchain pin. Repair: add "packageManager": "bun@<version>" to package.json.',
    ];
  const steps = await setupBunSteps(repository);
  if (steps.length === 0)
    return [
      `no oven-sh/setup-bun step found under .github/. Repair: add one that sets bun-version: ${pin} to a workflow.`,
    ];
  return steps.flatMap((step) => problem(step, pin) ?? []);
}

function repositoryWith(files: Record<string, string>): string {
  const repository = testFolder("pins-");
  projects.push(repository);
  for (const [path, content] of Object.entries({
    "package.json": '{"packageManager":"bun@1.4.4"}',
    ...files,
  })) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), content);
  }
  return repository;
}

function workflow(setupBun: string): string {
  return `jobs:\n  build:\n    steps:\n      - name: Set up Bun\n${setupBun}`;
}

test("every setup-bun step in a workflow or composite action sets bun-version to the toolchain pin", async () => {
  expect(await pinProblems(root)).toEqual([]);
});

test.each([
  [
    "a setup-bun step without bun-version",
    {
      ".github/workflows/ci.yml": workflow(
        "        uses: oven-sh/setup-bun@v2\n",
      ),
    },
    ".github/workflows/ci.yml job build step Set up Bun has no bun-version. Repair: set bun-version: 1.4.4 on that step.",
  ],
  [
    "a composite action with another version",
    {
      ".github/actions/setup/action.yml":
        "runs:\n  using: composite\n  steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: 1.4.3\n",
    },
    ".github/actions/setup/action.yml job composite action step #1 sets bun-version 1.4.3, and package.json pins 1.4.4. Repair: set bun-version: 1.4.4 on that step.",
  ],
  [
    "a bun-version-file",
    {
      ".github/workflows/ci.yml": workflow(
        "        uses: oven-sh/setup-bun@v2\n        with:\n          bun-version-file: .bun-version\n",
      ),
    },
    ".github/workflows/ci.yml job build step Set up Bun uses bun-version-file. Repair: set bun-version: 1.4.4 on that step.",
  ],
  [
    "a matrix value",
    {
      ".github/workflows/ci.yml": workflow(
        "        uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: ${{ matrix.bun }}\n",
      ),
    },
    ".github/workflows/ci.yml job build step Set up Bun sets bun-version from ${{ matrix.bun }}, which fails closed (a matrix value is not checked). Repair: set bun-version: 1.4.4 on that step.",
  ],
  [
    "no setup-bun step at all",
    {},
    "no oven-sh/setup-bun step found under .github/. Repair: add one that sets bun-version: 1.4.4 to a workflow.",
  ],
])(
  "%s fails, naming the file, job and step",
  async (_fault, files, message) => {
    expect(await pinProblems(repositoryWith(files))).toEqual([message]);
  },
);

test("a quoted pin in a .yaml workflow passes", async () => {
  const files = {
    ".github/workflows/release.yaml": workflow(
      '        uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: "1.4.4"\n',
    ),
  };
  expect(await pinProblems(repositoryWith(files))).toEqual([]);
});
