import { Effect, Data } from "effect";
import * as Schema from "effect/Schema";

export class JSONParseError extends Data.TaggedError("JSONParseError")<{}> {}

export const parseJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: () => new JSONParseError(),
  });

export const decodeJson = <A, E>(
  schema: Schema.Schema<A>,
  raw: unknown,
  onError: (cause: unknown) => E,
): Effect.Effect<A, E, unknown> =>
  Schema.decodeUnknownEffect(schema)(raw).pipe(Effect.mapError(onError));
