import type { D1Database } from "@cloudflare/workers-types";
import { Context, Layer } from "effect";

export class D1Service extends Context.Service<D1Service, D1Database>()("D1Service") {}

export const D1Live = (db: D1Database) => Layer.succeed(D1Service, db);
