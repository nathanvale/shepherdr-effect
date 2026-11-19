import {
  Context,
  Data,
  Effect,
  Layer,
  Ref,
  type Schema,
  type Scope,
  Stream,
} from "effect";
import { type NotBuilt, notBuilt } from "../not-built.ts";
import type { LiveMessage } from "./messages.ts";

export interface RequestFacts {
  readonly method: string;
  readonly path: string;
  readonly host: string;
  readonly origin: string | null;
  readonly tailnetLogin: string | null;
  readonly bearer: string | null;
  readonly marked: boolean;
  readonly upgrade: boolean;
}

export type RequestAdmission =
  | { readonly admitted: true; readonly who: string }
  | { readonly admitted: false; readonly status: number; readonly why: string };

export interface TransportReply {
  readonly status: number;
  readonly body: Schema.Json;
}

export interface TransportHandlers {
  readonly admitRequest: (facts: RequestFacts) => RequestAdmission;
  readonly handle: (
    who: string,
    facts: RequestFacts,
    body: Schema.Json,
  ) => Effect.Effect<TransportReply>;
}

class DaemonLockHeld extends Data.TaggedError("DaemonLockHeld")<{
  readonly heldBy: string;
}> {}

class PageGone extends Data.TaggedError("PageGone")<{
  readonly page: string;
}> {}

interface TransportShape {
  readonly serve: (
    handlers: TransportHandlers,
  ) => Effect.Effect<void, DaemonLockHeld | NotBuilt, Scope.Scope>;
  readonly publish: (message: LiveMessage) => Effect.Effect<void, NotBuilt>;
  readonly streamTerminal: (
    page: string,
    output: Stream.Stream<Uint8Array>,
  ) => Effect.Effect<void, PageGone | NotBuilt>;
}

export interface TransportTestScript {
  readonly daemonLockHeldBy?: string;
  readonly pages?: ReadonlyArray<string>;
}

interface TestWebAppShape {
  readonly request: (
    facts: RequestFacts,
    body: Schema.Json,
  ) => Effect.Effect<TransportReply>;
  readonly published: Effect.Effect<ReadonlyArray<LiveMessage>>;
  readonly terminalBytes: (
    page: string,
  ) => Effect.Effect<ReadonlyArray<Uint8Array>>;
}

export class TransportTestWebApp extends Context.Service<
  TransportTestWebApp,
  TestWebAppShape
>()("TransportTestWebApp") {}

const seam = "Transport";

export class Transport extends Context.Service<Transport, TransportShape>()(
  "Transport",
) {
  static readonly layer = Layer.succeed(Transport, {
    serve: () => notBuilt(seam, "serve"),
    publish: () => notBuilt(seam, "publish"),
    streamTerminal: () => notBuilt(seam, "streamTerminal"),
  });

  static layerTestWith(
    script: TransportTestScript,
  ): Layer.Layer<Transport | TransportTestWebApp> {
    return Layer.effectContext(
      Effect.gen(function* () {
        const serving = yield* Ref.make<TransportHandlers | undefined>(
          undefined,
        );
        const published = yield* Ref.make<ReadonlyArray<LiveMessage>>([]);
        const written = yield* Ref.make<
          ReadonlyArray<{ readonly page: string; readonly bytes: Uint8Array }>
        >([]);
        const locked = (handlers: TransportHandlers) =>
          Ref.modify(serving, (already) => {
            const heldBy =
              script.daemonLockHeldBy ??
              (already === undefined ? undefined : "this daemon");
            return heldBy === undefined
              ? [undefined, handlers]
              : [heldBy, already];
          }).pipe(
            Effect.flatMap((heldBy) =>
              heldBy === undefined
                ? Effect.void
                : Effect.fail(new DaemonLockHeld({ heldBy })),
            ),
          );

        const transport: TransportShape = {
          serve: (handlers) =>
            Effect.acquireRelease(locked(handlers), () =>
              Ref.set(serving, undefined),
            ),
          publish: (message) =>
            Ref.update(published, (all) => [...all, message]),
          streamTerminal: (page, output) =>
            (script.pages ?? []).includes(page)
              ? Stream.runForEach(output, (bytes) =>
                  Ref.update(written, (all) => [...all, { page, bytes }]),
                )
              : Effect.fail(new PageGone({ page })),
        };
        const webApp: TestWebAppShape = {
          request: (facts, body) =>
            Effect.flatMap(Ref.get(serving), (handlers) => {
              if (handlers === undefined)
                return Effect.succeed({ status: 503, body: "not serving" });
              const admission = handlers.admitRequest(facts);
              return admission.admitted
                ? handlers.handle(admission.who, facts, body)
                : Effect.succeed({
                    status: admission.status,
                    body: admission.why,
                  });
            }),
          published: Ref.get(published),
          terminalBytes: (page) =>
            Effect.map(Ref.get(written), (all) =>
              all.flatMap((each) => (each.page === page ? [each.bytes] : [])),
            ),
        };
        return Context.make(Transport, transport).pipe(
          Context.add(TransportTestWebApp, webApp),
        );
      }),
    );
  }

  static readonly layerTest = Transport.layerTestWith({});
}
