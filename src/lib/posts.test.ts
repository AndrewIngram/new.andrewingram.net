import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn();
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const transaction = vi.fn(() => Promise.reject(new Error("D1 does not support BEGIN")));

  return {
    db: { select, update, transaction },
    limit,
    updateWhere,
    transaction,
  };
});

vi.mock("@/db", () => ({
  getDbAsync: () => Promise.resolve(mocks.db),
}));

import { addPostImageDimensions, updatePost } from "./posts";

describe("updatePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([
      {
        id: "post-1",
        slug: "existing-post",
        title: "Existing post",
      },
    ]);
    mocks.updateWhere.mockResolvedValue(undefined);
  });

  it("updates an existing post without an explicit transaction", async () => {
    await Effect.runPromise(
      updatePost({
        id: "post-1",
        title: "Updated post",
        status: "draft",
        content: { type: "doc", content: [{ type: "paragraph" }] },
      }),
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.db.update).toHaveBeenCalledOnce();
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
  });
});

describe("addPostImageDimensions", () => {
  it("adds dimensions to matching image nodes", () => {
    const result = addPostImageDimensions(
      {
        type: "doc",
        content: [
          {
            type: "figure",
            content: [{ type: "image", attrs: { src: "/images/image-1", alt: "Cover" } }],
          },
        ],
      },
      new Map([["image-1", { width: 1200, height: 800 }]]),
    );

    expect(result.changed).toBe(true);
    expect(result.content.content?.[0].content?.[0].attrs).toEqual({
      src: "/images/image-1",
      alt: "Cover",
      width: 1200,
      height: 800,
    });
  });

  it("is idempotent", () => {
    const content = {
      type: "image",
      attrs: { src: "/images/image-1", width: 1200, height: 800 },
    };
    const result = addPostImageDimensions(
      content,
      new Map([["image-1", { width: 1200, height: 800 }]]),
    );

    expect(result.changed).toBe(false);
  });
});
