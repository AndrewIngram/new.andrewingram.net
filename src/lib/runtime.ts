import { Layer, ManagedRuntime } from "effect";
import { NodeContext } from "@effect/platform-node";

const MainLayer = Layer.mergeAll(NodeContext.layer);

export const AppRuntime = ManagedRuntime.make(MainLayer);
