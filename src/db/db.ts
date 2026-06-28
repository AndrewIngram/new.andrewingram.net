import type { D1Database } from "@cloudflare/workers-types";
import * as SqlD1Client from "@effect/sql-d1/D1Client";
import * as D1Drizzle from "drizzle-orm/effect-d1";
import { Context, Layer } from "effect";

export type AppDb = D1Drizzle.EffectSQLiteD1Database & {
	$client: SqlD1Client.D1Client;
};

export class DB extends Context.Service<DB, AppDb>()("@/db/DB") {}

export const dbLive = (db: D1Database) =>
	Layer.effect(DB, D1Drizzle.makeWithDefaults({})).pipe(
		Layer.provide(SqlD1Client.layer({ db })),
	);
