import { createServerFn } from "@tanstack/react-start";

import { createPost, updatePost, type SavePostInput } from "@/lib/posts";
import { AppRuntime } from "@/lib/runtime";

export const savePostAction = createServerFn({ method: "POST" })
  .inputValidator((input: SavePostInput) => input)
  .handler(({ data: input }) => {
    if (input.id === "new") {
      const { id: _, ...rest } = input;
      return AppRuntime.runPromise(createPost(rest));
    }

    return AppRuntime.runPromise(updatePost(input));
  });
