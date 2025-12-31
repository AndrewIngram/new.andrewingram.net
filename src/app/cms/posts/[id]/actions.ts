"use server";

import { savePost, type SavePostInput } from "@/lib/posts";
import { Effect } from "effect";

export async function savePostAction(input: SavePostInput) {
  return Effect.runPromise(savePost(input));
}
