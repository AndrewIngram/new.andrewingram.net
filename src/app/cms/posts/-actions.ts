import { createServerFn } from "@tanstack/react-start";

import { createPost, updatePost, type SavePostInput } from "@/lib/posts";
import { runMutation } from "@/lib/runtime";

export const savePostAction = createServerFn({ method: "POST" })
  .inputValidator((input: SavePostInput) => input)
  .handler(({ data: input }) => {
    if (input.id === "new") {
      const { id: _, ...rest } = input;
      return runMutation(createPost(rest), {
        name: "post.create",
        errorMessage: "Unable to create post.",
      });
    }

    return runMutation(updatePost(input), {
      name: "post.update",
      errorMessage: "Unable to save post.",
      context: { postId: input.id },
    });
  });
