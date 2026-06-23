import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runMutation } from "./runtime";

describe("runMutation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the server failure and throws a client-safe error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runMutation(Effect.fail(new Error("Database credentials exposed here")), {
        name: "post.update",
        errorMessage: "Unable to save post.",
        context: { postId: "post-1" },
      }),
    ).rejects.toThrow("Unable to save post.");

    expect(errorLog).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledWith(
      "[mutation:post.update] failed",
      expect.objectContaining({ postId: "post-1", error: expect.anything() }),
    );
  });
});
