import { createServerFn } from "@tanstack/react-start";

import {
  archivePost,
  discardPostDraft,
  publishPost,
  savePostDraft,
  type SavePostInput,
  unpublishPost,
} from "@/lib/posts";
import { runMutation } from "@/lib/runtime";
import {
  addWritingFeedbackDictionaryWord,
  addWritingFeedbackSuppression,
  type AddWritingFeedbackDictionaryWordInput,
  type AddWritingFeedbackSuppressionInput,
} from "@/lib/writing-feedback-preferences";

export const savePostAction = createServerFn({ method: "POST" })
  .validator((input: SavePostInput) => input)
  .handler(({ data: input }) =>
    runMutation(savePostDraft(input), {
      name: "post.draft.save",
      errorMessage: "Unable to save post.",
      context: { postId: input.id },
    }),
  );

export const publishPostAction = createServerFn({ method: "POST" })
  .validator((input: SavePostInput) => input)
  .handler(({ data: input }) =>
    runMutation(publishPost(input), {
      name: "post.publish",
      errorMessage: "Unable to publish post.",
      context: { postId: input.id },
    }),
  );

export const unpublishPostAction = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data: id }) =>
    runMutation(unpublishPost(id), {
      name: "post.unpublish",
      errorMessage: "Unable to unpublish post.",
      context: { postId: id },
    }),
  );

export const archivePostAction = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data: id }) =>
    runMutation(archivePost(id), {
      name: "post.archive",
      errorMessage: "Unable to archive post.",
      context: { postId: id },
    }),
  );

export const discardPostDraftAction = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(({ data: id }) =>
    runMutation(discardPostDraft(id), {
      name: "post.draft.discard",
      errorMessage: "Unable to discard draft changes.",
      context: { postId: id },
    }),
  );

export const addWritingFeedbackSuppressionAction = createServerFn({ method: "POST" })
  .validator((input: AddWritingFeedbackSuppressionInput) => input)
  .handler(({ data: input }) =>
    runMutation(addWritingFeedbackSuppression(input), {
      name: "writingFeedback.suppression.add",
      errorMessage: "Unable to save writing feedback preference.",
      context: { postId: input.postId, scope: input.scope },
    }),
  );

export const addWritingFeedbackDictionaryWordAction = createServerFn({ method: "POST" })
  .validator((input: AddWritingFeedbackDictionaryWordInput) => input)
  .handler(({ data: input }) =>
    runMutation(addWritingFeedbackDictionaryWord(input), {
      name: "writingFeedback.dictionaryWord.add",
      errorMessage: "Unable to save writing feedback preference.",
      context: { postId: input.postId, scope: input.scope },
    }),
  );
