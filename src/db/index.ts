import { drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import { env } from "@/env";

export const getDb = cache(() => {
  return drizzle(env.DB);
});

export const getDbAsync = cache(async () => {
  return drizzle(env.DB);
});
