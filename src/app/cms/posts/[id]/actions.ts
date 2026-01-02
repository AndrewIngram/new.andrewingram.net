"use server";

import { savePost, type SavePostInput } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

export async function savePostAction(input: SavePostInput) {
  return AppRuntime.runPromise(savePost(input));
}
