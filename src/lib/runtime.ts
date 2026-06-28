import { Effect } from "effect";

import { DB, dbLive } from "@/db/db";
import { env } from "@/env";

export const AppRuntime = {
  runPromise<A, E>(effect: Effect.Effect<A, E, DB>) {
    return Effect.runPromise(effect.pipe(Effect.provide(dbLive(env.DB))));
  },
};

type MutationOptions = {
  name: string;
  errorMessage: string;
  context?: Record<string, unknown>;
};

export async function runMutation<A, E>(
  effect: Effect.Effect<A, E, DB>,
  { name, errorMessage, context = {} }: MutationOptions,
): Promise<A> {
  try {
    return await AppRuntime.runPromise(effect);
  } catch (error) {
    console.error(`[mutation:${name}] failed`, { ...context, error });
    throw new Error(errorMessage);
  }
}
