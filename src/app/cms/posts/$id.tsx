import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";

import { uploadImageAction } from "@/app/cms/-image-actions";
import { getAllImages } from "@/lib/images";
import { createDraftPost, getPostById } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

import { savePostAction } from "./-actions";
import Editor from "./-editor";

const getPostEditorData = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const post =
      id === "new"
        ? createDraftPost()
        : await AppRuntime.runPromise(getPostById(id)).catch(() => null);

    if (!post) {
      throw notFound();
    }

    const images = await AppRuntime.runPromise(getAllImages());

    return { post, images };
  });

export const Route = createFileRoute("/cms/posts/$id")({
  loader: ({ params }) => {
    console.log("Loading post editor data for id:", params.id);
    return getPostEditorData({ data: params.id });
  },
  component: PostEditorPage,
});

function PostEditorPage() {
  const { post, images } = Route.useLoaderData();
  const savePost = useServerFn(savePostAction);
  const uploadImage = useServerFn(uploadImageAction);

  return (
    <Editor
      post={post}
      images={images}
      savePost={(input) => savePost({ data: input })}
      uploadImage={(formData) => uploadImage({ data: formData })}
    />
  );
}
