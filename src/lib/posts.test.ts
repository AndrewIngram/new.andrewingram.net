import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DB } from "@/db/db";

const mocks = vi.hoisted(() => {
  const limit = vi.fn(() => Effect.succeed([]));
  const selectWhere = vi.fn(() => ({ limit }));
  const orderBy = vi.fn(() => Effect.succeed([]));
  const from = vi.fn(() => ({ orderBy, where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn(() => Effect.succeed(undefined));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const transaction = vi.fn(() =>
    Promise.reject(new Error("D1 does not support BEGIN")),
  );

  return {
    db: { select, update, transaction },
    limit,
    orderBy,
    updateWhere,
    transaction,
  };
});

import { addPostImageDimensions, getAllPosts, updatePost } from "./posts";

const provideDb = <A, E>(effect: Effect.Effect<A, E, DB>) =>
  effect.pipe(Layer.provide(Layer.succeed(DB, mocks.db as never)));

describe("getAllPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderBy.mockResolvedValue([
      {
        id: "post-1",
        slug: "legacy-post",
        title: "Legacy post",
        status: "draft",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Body" }] },
          ],
        },
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      },
    ]);
  });

  it("normalizes legacy content without a title node", async () => {
    const posts = await Effect.runPromise(provideDb(getAllPosts()));

    expect(posts[0]?.content.content).toEqual([
      { type: "title", content: [{ type: "text", text: "Legacy post" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
    ]);
  });
});

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
      provideDb(
        updatePost({
          id: "post-1",
          title: "Updated post",
          status: "draft",
          content: {
            type: "doc",
            content: [{ type: "title" }, { type: "paragraph" }],
          },
        }),
      ),
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
          { type: "title" },
          {
            type: "figure",
            content: [
              {
                type: "image",
                attrs: { src: "/images/image-1", alt: "Cover" },
              },
            ],
          },
        ],
      },
      new Map([["image-1", { width: 1200, height: 800 }]]),
    );

    expect(result.changed).toBe(true);
    expect(result.content.content?.[1].content?.[0].attrs).toEqual({
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
