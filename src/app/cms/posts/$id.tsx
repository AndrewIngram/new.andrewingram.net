import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";

import { uploadImageAction } from "@/app/cms/-image-actions";
import { getAllImages } from "@/lib/images";
import { createDraftPost, getPostById } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";
import { getWritingFeedbackPreferences } from "@/lib/writing-feedback-preferences";

import {
  addWritingFeedbackDictionaryWordAction,
  addWritingFeedbackSuppressionAction,
  archivePostAction,
  discardPostDraftAction,
  publishPostAction,
  savePostAction,
  unpublishPostAction,
} from "./-actions";
import Editor from "./-editor";

const getPostEditorData = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const post =
      id === "new"
        ? createDraftPost()
        : await AppRuntime.runPromise(getPostById(id)).catch(() => null);

    if (!post) {
      throw notFound();
    }

    const images = await AppRuntime.runPromise(getAllImages());
    const writingFeedbackPreferences = await AppRuntime.runPromise(
      getWritingFeedbackPreferences(id === "new" ? undefined : id),
    );

    return { post, images, writingFeedbackPreferences };
  });

export const Route = createFileRoute("/cms/posts/$id")({
  loader: ({ params }) => getPostEditorData({ data: params.id }),
  component: PostEditorPage,
});

function PostEditorPage() {
  const { post, images, writingFeedbackPreferences } = Route.useLoaderData();
  const savePost = useServerFn(savePostAction);
  const publishPost = useServerFn(publishPostAction);
  const unpublishPost = useServerFn(unpublishPostAction);
  const archivePost = useServerFn(archivePostAction);
  const discardPostDraft = useServerFn(discardPostDraftAction);
  const addWritingFeedbackSuppression = useServerFn(addWritingFeedbackSuppressionAction);
  const addWritingFeedbackDictionaryWord = useServerFn(addWritingFeedbackDictionaryWordAction);
  const uploadImage = useServerFn(uploadImageAction);

  return (
    <Editor
      post={post}
      images={images}
      writingFeedbackPreferences={writingFeedbackPreferences}
      savePost={(input) => savePost({ data: input })}
      publishPost={(input) => publishPost({ data: input })}
      unpublishPost={(id) => unpublishPost({ data: id })}
      archivePost={(id) => archivePost({ data: id })}
      discardPostDraft={(id) => discardPostDraft({ data: id })}
      addWritingFeedbackSuppression={(input) =>
        addWritingFeedbackSuppression({ data: input })
      }
      addWritingFeedbackDictionaryWord={(input) =>
        addWritingFeedbackDictionaryWord({ data: input })
      }
      uploadImage={(formData) => uploadImage({ data: formData })}
    />
  );
}
