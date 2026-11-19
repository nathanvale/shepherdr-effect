import { Data, type Effect, Result, Schema, type Stream } from "effect";
import type {
  AttemptId,
  PositiveEvidence,
  RefutingEvidence,
} from "../../domains/attempt/index.ts";
import type { NotBuilt } from "../not-built.ts";
import type { SendPermit } from "./send-permit.ts";

export const TerminalAddress = Schema.NonEmptyString.pipe(
  Schema.brand("TerminalAddress"),
);
export type TerminalAddress = typeof TerminalAddress.Type;

export interface Terminal {
  readonly address: TerminalAddress;
  readonly name: string | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly keep: boolean;
}

export interface TerminalStart {
  readonly argv: readonly [string, ...string[]];
  readonly cwd: string;
  readonly name: string | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly keep: boolean;
}

export type Typed =
  | { readonly _tag: "Text"; readonly text: string }
  | { readonly _tag: "Keys"; readonly keys: ReadonlyArray<string> }
  | { readonly _tag: "Interrupt" };

export type TerminalEvent =
  | { readonly _tag: "TerminalChanged"; readonly terminal: Terminal }
  | { readonly _tag: "TerminalRemoved"; readonly address: TerminalAddress };

export interface SharedDocument {
  readonly name: string;
  readonly value: Schema.Json;
  readonly version: number;
}

export interface MachineCommand {
  readonly machine: string;
  readonly argv: readonly [string, ...string[]];
  readonly stdin?: string;
}

export interface MachineReply {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type LaunchObservation =
  | PositiveEvidence
  | { readonly _tag: "Unobservable" };

// Interface: `not-sent` is answered only when nothing of the request was
// written to the link. Whenever that is in doubt the answer is `unanswered`.
export class HerdrCoreUnavailable extends Data.TaggedError(
  "HerdrCoreUnavailable",
)<{
  readonly entry: string;
  readonly request: "not-sent" | "unanswered";
}> {}

export class TerminalNotFound extends Data.TaggedError("TerminalNotFound")<{
  readonly address: TerminalAddress;
}> {}

export class SendPermitRefused extends Data.TaggedError("SendPermitRefused")<{
  readonly reason: "not made by the send permit maker, or already spent";
}> {}

export class SharedDocumentConflict extends Data.TaggedError(
  "SharedDocumentConflict",
)<{ readonly name: string; readonly version: number }> {}

export class MachineNotLinked extends Data.TaggedError("MachineNotLinked")<{
  readonly machine: string;
}> {}

export interface HerdrCoreShape {
  readonly startTerminal: (
    permit: SendPermit,
    start: TerminalStart,
  ) => Effect.Effect<
    TerminalAddress,
    SendPermitRefused | HerdrCoreUnavailable | NotBuilt
  >;
  readonly listTerminals: (
    labels?: Readonly<Record<string, string>>,
  ) => Effect.Effect<ReadonlyArray<Terminal>, HerdrCoreUnavailable | NotBuilt>;
  readonly readScreen: (
    address: TerminalAddress,
  ) => Effect.Effect<
    string,
    TerminalNotFound | HerdrCoreUnavailable | NotBuilt
  >;
  readonly labelTerminal: (
    address: TerminalAddress,
    labels: Readonly<Record<string, string | null>>,
  ) => Effect.Effect<void, TerminalNotFound | HerdrCoreUnavailable | NotBuilt>;
  readonly typeInto: (
    address: TerminalAddress,
    typed: Typed,
  ) => Effect.Effect<void, TerminalNotFound | HerdrCoreUnavailable | NotBuilt>;
  readonly killTerminal: (
    address: TerminalAddress,
  ) => Effect.Effect<void, TerminalNotFound | HerdrCoreUnavailable | NotBuilt>;
  readonly watchTerminal: (
    address: TerminalAddress,
  ) => Stream.Stream<
    Uint8Array,
    TerminalNotFound | HerdrCoreUnavailable | NotBuilt
  >;
  readonly events: Stream.Stream<
    TerminalEvent,
    HerdrCoreUnavailable | NotBuilt
  >;
  readonly readSharedDocument: (
    name: string,
    machine?: string,
  ) => Effect.Effect<
    SharedDocument,
    MachineNotLinked | HerdrCoreUnavailable | NotBuilt
  >;
  readonly updateSharedDocument: (
    document: SharedDocument,
    machine?: string,
  ) => Effect.Effect<
    SharedDocument,
    SharedDocumentConflict | MachineNotLinked | HerdrCoreUnavailable | NotBuilt
  >;
  readonly execOnMachine: (
    command: MachineCommand,
  ) => Effect.Effect<
    MachineReply,
    MachineNotLinked | HerdrCoreUnavailable | NotBuilt
  >;
  readonly writeFileOnMachine: (
    machine: string,
    path: string,
    bytes: Uint8Array,
  ) => Effect.Effect<void, MachineNotLinked | HerdrCoreUnavailable | NotBuilt>;
  readonly listMachines: Effect.Effect<
    ReadonlyArray<string>,
    HerdrCoreUnavailable | NotBuilt
  >;
  // Interface: positive evidence is exactly one terminal labelled with the
  // attempt id. Anything else is `Unobservable`, because a link cannot tell
  // that no request for that attempt is still pending in herdr-core.
  readonly observeLaunch: (
    attemptId: AttemptId,
  ) => Effect.Effect<LaunchObservation, HerdrCoreUnavailable | NotBuilt>;
}

function whyNothingWasSent(
  failure: SendPermitRefused | HerdrCoreUnavailable | NotBuilt,
): string | undefined {
  switch (failure._tag) {
    case "SendPermitRefused":
      return "the send permit was refused, so no request was made";
    case "HerdrCoreUnavailable":
      return failure.request === "not-sent"
        ? "the link was lost before the request was sent"
        : undefined;
    case "NotBuilt":
      return undefined;
  }
}

// Interface: `reply` is the reply to the only start that the attempt's effect
// made. After a second start for the same attempt id this answer can be untrue.
export function observeStartReply(
  attemptId: AttemptId,
  reply: Result.Result<
    TerminalAddress,
    SendPermitRefused | HerdrCoreUnavailable | NotBuilt
  >,
): LaunchObservation | RefutingEvidence {
  if (Result.isSuccess(reply))
    return { _tag: "PositiveEvidence", attemptId, result: reply.success };
  const reason = whyNothingWasSent(reply.failure);
  return reason === undefined
    ? { _tag: "Unobservable" }
    : { _tag: "RefutingEvidence", attemptId, reason };
}
