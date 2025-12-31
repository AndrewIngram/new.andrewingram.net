import {
  createDraftPost,
  getPostById,
  savePost,
  SavePostInput,
} from "@/lib/posts";
import { notFound } from "next/navigation";

import Editor from "./editor";

import { AppRuntime } from "@/lib/runtime";

async function savePostAction(input: SavePostInput) {
  "use server";
  return AppRuntime.runPromise(savePost(input));
}

export default async function Page({ params }: PageProps<"/cms/posts/[id]">) {
  const { id } = await params;

  const post =
    id === "new"
      ? createDraftPost()
      : await AppRuntime.runPromise(getPostById(id)).catch(() => null);

  if (!post) {
    notFound();
  }

  return (
    <Editor post={post} savePost={savePostAction} />
  );
}
