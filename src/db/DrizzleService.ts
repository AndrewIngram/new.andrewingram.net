import type { D1Database } from "@cloudflare/workers-types";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import { Context, Layer } from "effect";

export class DrizzleService extends Context.Service<
  DrizzleService,
  DrizzleD1Database
>()("DrizzleService") {}

export const DrizzleTest = Layer.succeed(DrizzleService, {} as DrizzleD1Database);

export const DrizzleLive = (d1: D1Database) =>
  Layer.succeed(DrizzleService, drizzle(d1));
