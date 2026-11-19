import { Data, type Effect, Schema, type Stream } from "effect";
import type {
  AttemptId,
  PositiveEvidence,
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
  | { readonly _tag: "NoEvidence" }
  | { readonly _tag: "Unobservable" };

export class HerdrCoreUnavailable extends Data.TaggedError(
  "HerdrCoreUnavailable",
)<{ readonly entry: string }> {}

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
  readonly observeLaunch: (
    attemptId: AttemptId,
  ) => Effect.Effect<LaunchObservation, HerdrCoreUnavailable | NotBuilt>;
}
