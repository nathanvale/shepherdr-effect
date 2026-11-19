import { Context, Data, Effect, Layer, Redacted } from "effect";
import { type NotBuilt, notBuilt } from "../not-built.ts";

export type Secret = Redacted.Redacted<string>;

export interface ChildCommand {
  readonly program: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly stdin?: Secret | string;
  readonly timeoutMs: number;
}

export interface ChildExit {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

class ProcessRefused extends Data.TaggedError("ProcessRefused")<{
  readonly program: string;
  readonly reason: "hc is reached only through the herdr-core link";
}> {}

class ProcessNotStarted extends Data.TaggedError("ProcessNotStarted")<{
  readonly program: string;
}> {}

class ProcessTimedOut extends Data.TaggedError("ProcessTimedOut")<{
  readonly program: string;
  readonly timeoutMs: number;
}> {}

interface ProcessShape {
  readonly run: (
    command: ChildCommand,
  ) => Effect.Effect<
    ChildExit,
    ProcessRefused | ProcessNotStarted | ProcessTimedOut | NotBuilt
  >;
}

export interface ProcessTestScript {
  readonly programs?: Readonly<
    Record<
      string,
      (command: ChildCommand, stdin: string | undefined) => ChildExit | "hangs"
    >
  >;
}

function isHc(program: string): boolean {
  return program.split("/").at(-1) === "hc";
}

function stdinText(stdin: ChildCommand["stdin"]): string | undefined {
  return Redacted.isRedacted(stdin) ? Redacted.value(stdin) : stdin;
}

export class Process extends Context.Service<Process, ProcessShape>()(
  "Process",
) {
  static readonly layer = Layer.succeed(Process, {
    run: () => notBuilt("Process", "run"),
  });

  static layerTestWith(script: ProcessTestScript): Layer.Layer<Process> {
    return Layer.succeed(Process, {
      run: (command) => {
        const { program, timeoutMs } = command;
        if (isHc(program))
          return Effect.fail(
            new ProcessRefused({
              program,
              reason: "hc is reached only through the herdr-core link",
            }),
          );
        const scripted = script.programs?.[program];
        if (scripted === undefined)
          return Effect.fail(new ProcessNotStarted({ program }));
        const exit = scripted(command, stdinText(command.stdin));
        return exit === "hangs"
          ? Effect.fail(new ProcessTimedOut({ program, timeoutMs }))
          : Effect.succeed(exit);
      },
    });
  }

  static readonly layerTest = Process.layerTestWith({});
}
