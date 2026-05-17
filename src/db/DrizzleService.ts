import type { D1Database } from "@cloudflare/workers-types";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import { Context, Layer } from "effect";
import * as schema from "../db/schema";

export class DrizzleService extends Context.Service<
  DrizzleService,
  DrizzleD1Database<typeof schema>
>()("DrizzleService") {}

export const DrizzleTest = Layer.succeed(DrizzleService, {} as DrizzleD1Database<typeof schema>);

export const DrizzleLive = (d1: D1Database) =>
  Layer.succeed(DrizzleService, drizzle(d1, { schema }));
