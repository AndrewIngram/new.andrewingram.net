import { createDraftPost, getPostById } from "@/lib/posts";
import { notFound } from "next/navigation";

import Editor from "./editor";
import { savePostAction } from "./actions";

import { AppRuntime } from "@/lib/runtime";
import { getAllImages } from "@/lib/images";
import { uploadImageAction } from "@/app/cms/images/actions";

export default async function Page({ params }: PageProps<"/cms/posts/[id]">) {
  const { id } = await params;

  const post =
    id === "new"
      ? createDraftPost()
      : await AppRuntime.runPromise(getPostById(id)).catch(() => null);

  const images = await AppRuntime.runPromise(getAllImages());

  if (!post) {
    notFound();
  }

  return (
    <Editor
      post={post}
      savePost={savePostAction}
      uploadImage={uploadImageAction}
      images={images}
    />
  );
}
