import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DB } from "@/db/db";
import type { PostContent } from "./post-content-schema";

const mocks = vi.hoisted(() => {
  const limit = vi.fn((): Effect.Effect<unknown[], never, never> =>
    Effect.succeed([]),
  );
  const orderBy = vi.fn((): Effect.Effect<unknown[], never, never> =>
    Effect.succeed([]),
  );
  const where = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ orderBy, where }));
  const select = vi.fn(() => ({ from }));
  const updateWhere = vi.fn((): Effect.Effect<void, never, never> =>
    Effect.succeed(undefined),
  );
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const values = vi.fn((): Effect.Effect<void, never, never> =>
    Effect.succeed(undefined),
  );
  const insert = vi.fn(() => ({ values }));
  const deleteWhere = vi.fn((): Effect.Effect<void, never, never> =>
    Effect.succeed(undefined),
  );
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));
  const transaction = vi.fn(() =>
    Promise.reject(new Error("D1 does not support BEGIN")),
  );

  return {
    db: { select, update, insert, delete: deleteFrom, transaction },
    limit,
    orderBy,
    updateWhere,
    values,
    deleteWhere,
    transaction,
    set,
  };
});

import {
  addPostImageDimensions,
  discardPostDraft,
  getAllPosts,
  getPublishedPostBySlug,
  getPublishedPosts,
  publishPost,
  savePostDraft,
} from "./posts";

const content: PostContent = {
  type: "doc",
  content: [{ type: "title" }, { type: "paragraph" }],
};

const row = {
  id: "post-1",
  status: "published" as const,
  draftSlug: "existing-post",
  draftTitle: "Existing post",
  draftContent: content,
  draftShowOutline: false,
  draftUpdatedAt: new Date("2024-01-02T00:00:00.000Z"),
  publishedSlug: "existing-post",
  publishedTitle: "Existing post",
  publishedContent: content,
  publishedShowOutline: false,
  publishedAt: new Date("2024-01-01T00:00:00.000Z"),
  lastPublishedAt: new Date("2024-01-02T00:00:00.000Z"),
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-02T00:00:00.000Z"),
};

const provideDb = <A, E>(effect: Effect.Effect<A, E, DB>) =>
  effect.pipe(Effect.provideService(DB, mocks.db as never));

const orderByColumnName = () => {
  const calls = mocks.orderBy.mock.calls as unknown[][];
  const call = calls[calls.length - 1];
  const expression = call?.[0] as
    | { queryChunks?: Array<{ name?: string }> }
    | undefined;
  return expression?.queryChunks?.find((chunk) => typeof chunk.name === "string")?.name;
};

const resetMocks = () => {
  vi.clearAllMocks();
  mocks.limit.mockReset();
  mocks.orderBy.mockReset();
  mocks.updateWhere.mockReset();
  mocks.values.mockReset();
  mocks.deleteWhere.mockReset();
  mocks.limit.mockReturnValue(Effect.succeed([]));
  mocks.orderBy.mockReturnValue(Effect.succeed([]));
  mocks.updateWhere.mockReturnValue(Effect.succeed(undefined));
  mocks.values.mockReturnValue(Effect.succeed(undefined));
  mocks.deleteWhere.mockReturnValue(Effect.succeed(undefined));
};

describe("getAllPosts", () => {
  beforeEach(() => {
    resetMocks();
    mocks.orderBy.mockReturnValue(
      Effect.succeed([
        {
          ...row,
          status: "draft",
          draftSlug: "legacy-post",
          draftTitle: "Legacy post",
          draftContent: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Body" }] },
            ],
          },
          draftShowOutline: false,
          publishedSlug: null,
          publishedTitle: null,
          publishedContent: null,
          publishedShowOutline: false,
          publishedAt: null,
          lastPublishedAt: null,
        },
      ]),
    );
  });

  it("normalizes draft content without a title node", async () => {
    const posts = await Effect.runPromise(provideDb(getAllPosts()));

    expect(posts[0]?.content.content).toEqual([
      { type: "title", content: [{ type: "text", text: "Legacy post" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
    ]);
  });

  it("detects draft outline changes", async () => {
    mocks.orderBy.mockReturnValue(
      Effect.succeed([{ ...row, draftShowOutline: true, publishedShowOutline: false }]),
    );

    const posts = await Effect.runPromise(provideDb(getAllPosts()));

    expect(posts[0]?.hasDraftChanges).toBe(true);
  });
});

describe("getPublishedPosts", () => {
  beforeEach(() => {
    resetMocks();
    mocks.orderBy.mockReturnValue(Effect.succeed([]));
  });

  it("orders homepage posts by publication date", async () => {
    await Effect.runPromise(provideDb(getPublishedPosts()));

    expect(orderByColumnName()).toBe("published_at");
  });
});

describe("savePostDraft", () => {
  beforeEach(() => {
    resetMocks();
    mocks.limit
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([row]));
    mocks.updateWhere.mockReturnValue(Effect.succeed(undefined));
  });

  it("updates an existing draft without an explicit transaction", async () => {
    await Effect.runPromise(
      provideDb(
        savePostDraft({
          id: "post-1",
          title: "Updated post",
          slug: "updated-post",
          content,
          showOutline: true,
        }),
      ),
    );

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.db.update).toHaveBeenCalledOnce();
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ draftShowOutline: true }),
    );
  });
});

describe("publishPost", () => {
  beforeEach(() => {
    resetMocks();
    mocks.limit
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([row]))
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([]));
    mocks.values.mockReturnValue(Effect.succeed(undefined));
    mocks.deleteWhere.mockReturnValue(Effect.succeed(undefined));
    mocks.updateWhere.mockReturnValue(Effect.succeed(undefined));
  });

  it("republishes current draft fields and records the old slug redirect", async () => {
    await Effect.runPromise(
      provideDb(
        publishPost({
          id: "post-1",
          title: "Updated post",
          slug: "updated-post",
          content,
          showOutline: true,
        }),
      ),
    );

    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({ slug: "existing-post", postId: "post-1" }),
    ]);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "published",
        draftSlug: "updated-post",
        draftShowOutline: true,
        publishedSlug: "updated-post",
        publishedShowOutline: true,
        publishedAt: row.publishedAt,
      }),
    );
  });

  it("uses an explicit publication date for first publish", async () => {
    const publishedAt = "2019-05-04T10:30:00.000Z";

    await Effect.runPromise(
      provideDb(
        publishPost({
          id: "new",
          title: "Imported post",
          slug: "imported-post",
          content,
          showOutline: true,
          publishedAt,
        }),
      ),
    );

    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "published",
        publishedSlug: "imported-post",
        draftShowOutline: true,
        publishedShowOutline: true,
        publishedAt: new Date(publishedAt),
      }),
    ]);
  });

  it("uses an explicit publication date when republishing", async () => {
    const publishedAt = "2019-05-04T10:30:00.000Z";

    await Effect.runPromise(
      provideDb(
        publishPost({
          id: "post-1",
          title: "Updated post",
          slug: "updated-post",
          content,
          showOutline: true,
          publishedAt,
        }),
      ),
    );

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedAt: new Date(publishedAt),
        lastPublishedAt: expect.any(Date),
      }),
    );
  });

  it("preserves the existing publication date when republish receives an invalid date", async () => {
    await Effect.runPromise(
      provideDb(
        publishPost({
          id: "post-1",
          title: "Updated post",
          slug: "updated-post",
          content,
          showOutline: true,
          publishedAt: "not-a-date",
        }),
      ),
    );

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedAt: row.publishedAt,
      }),
    );
  });
});

describe("discardPostDraft", () => {
  beforeEach(() => {
    resetMocks();
    mocks.limit.mockReturnValueOnce(
      Effect.succeed([{ ...row, draftShowOutline: true, publishedShowOutline: false }]),
    );
    mocks.updateWhere.mockReturnValue(Effect.succeed(undefined));
  });

  it("restores the published outline setting", async () => {
    await Effect.runPromise(provideDb(discardPostDraft("post-1")));

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ draftShowOutline: false }),
    );
  });
});

describe("getPublishedPostBySlug", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("loads only a published version for the public site", async () => {
    mocks.limit.mockReturnValueOnce(Effect.succeed([row]));

    const result = await Effect.runPromise(
      provideDb(getPublishedPostBySlug("existing-post")),
    );

    expect(result.post.title).toBe("Existing post");
    expect(result.post.showOutline).toBe(false);
    expect(result.redirectTo).toBeUndefined();
  });

  it("resolves a slug redirect to a published target", async () => {
    mocks.limit
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([{ postId: "post-1" }]))
      .mockReturnValueOnce(Effect.succeed([row]));

    const result = await Effect.runPromise(
      provideDb(getPublishedPostBySlug("old-post")),
    );

    expect(result.redirectTo).toBe("existing-post");
  });

  it("does not serve hidden posts", async () => {
    mocks.limit
      .mockReturnValueOnce(Effect.succeed([]))
      .mockReturnValueOnce(Effect.succeed([]));

    await expect(
      Effect.runPromise(provideDb(getPublishedPostBySlug("draft-post"))),
    ).rejects.toMatchObject({ _tag: "RecordNotFound" });
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
