import { drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import { env } from "@/env";
import * as schema from "./schema";

export const getDb = cache(() => {
  return drizzle(env.DB, { schema });
});

export const getDbAsync = cache(async () => {
  return drizzle(env.DB, { schema });
});
