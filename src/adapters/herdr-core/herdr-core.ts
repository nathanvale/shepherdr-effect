import { Context, Layer, Stream } from "effect";
import { NotBuilt, notBuilt } from "../not-built.ts";
import type { HerdrCoreShape } from "./herdr-core-link.ts";
import {
  type HerdrCoreTestScript,
  herdrCoreTestLink,
} from "./herdr-core-test-link.ts";

const seam = "HerdrCore";

function streamNotBuilt(entry: string): Stream.Stream<never, NotBuilt> {
  return Stream.fail(new NotBuilt({ seam, entry }));
}

export class HerdrCore extends Context.Service<HerdrCore, HerdrCoreShape>()(
  "HerdrCore",
) {
  static readonly layer = Layer.succeed(HerdrCore, {
    startTerminal: () => notBuilt(seam, "startTerminal"),
    listTerminals: () => notBuilt(seam, "listTerminals"),
    readScreen: () => notBuilt(seam, "readScreen"),
    labelTerminal: () => notBuilt(seam, "labelTerminal"),
    typeInto: () => notBuilt(seam, "typeInto"),
    killTerminal: () => notBuilt(seam, "killTerminal"),
    watchTerminal: () => streamNotBuilt("watchTerminal"),
    events: streamNotBuilt("events"),
    readSharedDocument: () => notBuilt(seam, "readSharedDocument"),
    updateSharedDocument: () => notBuilt(seam, "updateSharedDocument"),
    execOnMachine: () => notBuilt(seam, "execOnMachine"),
    writeFileOnMachine: () => notBuilt(seam, "writeFileOnMachine"),
    listMachines: notBuilt(seam, "listMachines"),
    observeLaunch: () => notBuilt(seam, "observeLaunch"),
  });

  static layerTestWith(script: HerdrCoreTestScript): Layer.Layer<HerdrCore> {
    return Layer.effect(HerdrCore, herdrCoreTestLink(script));
  }

  static readonly layerTest = HerdrCore.layerTestWith({});
}
