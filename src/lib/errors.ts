import { Data } from "effect";

export class RecordNotFound extends Data.TaggedError("RecordNotFound")<{
  model: string;
  id: string;
}> {}
