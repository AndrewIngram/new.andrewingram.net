import { Effect } from "effect";

export const AppRuntime = Effect;

type MutationOptions = {
  name: string;
  errorMessage: string;
  context?: Record<string, unknown>;
};

export async function runMutation<A, E>(
  effect: Effect.Effect<A, E>,
  { name, errorMessage, context = {} }: MutationOptions,
): Promise<A> {
  try {
    return await AppRuntime.runPromise(effect);
  } catch (error) {
    console.error(`[mutation:${name}] failed`, { ...context, error });
    throw new Error(errorMessage);
  }
}
