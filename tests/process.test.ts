import { expect, test } from "bun:test";
import { Effect, Redacted } from "effect";
import {
  type ChildCommand,
  Process,
  type ProcessTestScript,
} from "../src/adapters/process/index.ts";
import { failureOf, unbuiltEntryOf } from "./adapter-fixtures.ts";

const gitStatus: ChildCommand = {
  program: "git",
  args: ["status", "--porcelain"],
  cwd: "work/shepherdr",
  timeoutMs: 4_000,
};

function ran(command: ChildCommand, script?: ProcessTestScript) {
  const layer =
    script === undefined ? Process.layerTest : Process.layerTestWith(script);
  return Effect.runPromise(
    Effect.flatMap(Process, (process) => process.run(command)).pipe(
      Effect.result,
      Effect.provide(layer),
    ),
  );
}

async function refusalOf(command: ChildCommand, script?: ProcessTestScript) {
  const result = await ran(command, script);
  return result._tag === "Failure" ? failureOf(result.failure) : "it ran";
}

test("a child process is handed its words, and a secret reaches it only on standard input", async () => {
  const asked: unknown[] = [];
  const result = await ran(
    { ...gitStatus, program: "az", stdin: Redacted.make("s3cr3t") },
    {
      programs: {
        az: (command, stdin) => {
          asked.push({ args: command.args, cwd: command.cwd, stdin });
          return { exitCode: 3, stdout: "", stderr: "not signed in" };
        },
      },
    },
  );

  expect(asked).toEqual([
    { args: ["status", "--porcelain"], cwd: "work/shepherdr", stdin: "s3cr3t" },
  ]);
  expect(result._tag === "Success" ? result.success : "it failed").toEqual({
    exitCode: 3,
    stdout: "",
    stderr: "not signed in",
  });
});

test("hc is refused by any path, and whatever was scripted for it is never asked", async () => {
  const asked: string[] = [];
  const hc = () => {
    asked.push("hc ran");
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const refusals = [
    await refusalOf({ ...gitStatus, program: "hc" }, { programs: { hc } }),
    await refusalOf(
      { ...gitStatus, program: "tools/bin/hc" },
      { programs: { "tools/bin/hc": hc } },
    ),
  ];

  const reason = "hc is reached only through the herdr-core link";
  expect(asked).toEqual([]);
  expect(refusals).toEqual([
    { _tag: "ProcessRefused", program: "hc", reason },
    { _tag: "ProcessRefused", program: "tools/bin/hc", reason },
  ]);
});

test("a program that is not there is not started, and one that hangs times out at its limit", async () => {
  const refusals = [
    await refusalOf(gitStatus),
    await refusalOf(gitStatus, { programs: { git: () => "hangs" } }),
  ];

  expect(refusals).toEqual([
    { _tag: "ProcessNotStarted", program: "git" },
    { _tag: "ProcessTimedOut", program: "git", timeoutMs: 4_000 },
  ]);
});

test("the real layer answers NotBuilt for its one entry, naming it", async () => {
  const unbuilt = await Effect.runPromise(
    Effect.flatMap(Process, (process) =>
      Effect.flip(process.run(gitStatus)),
    ).pipe(Effect.provide(Process.layer)),
  );

  expect(unbuiltEntryOf(unbuilt)).toBe("NotBuilt: Process.run");
});
