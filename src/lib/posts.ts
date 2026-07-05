import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ne, or } from "drizzle-orm";
import slugify from "slugify";
import { DB, type AppDb } from "@/db/db";
import { postSlugRedirects, posts } from "@/db/schema";
import { RecordNotFound } from "./errors";
import { PostContentSchema, type PostContent } from "./post-content-schema";
import type { JSONContent } from "./post-content-json";

const PostStatusSchema = Schema.Literals([
  "draft",
  "published",
  "unpublished",
  "archived",
]);

export type PostStatus = Schema.Schema.Type<typeof PostStatusSchema>;

export type Post = {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  content: PostContent;
  createdAt: string;
  updatedAt: string;
  draftUpdatedAt: string;
  publishedAt?: string | undefined;
  lastPublishedAt?: string | undefined;
  publishedSlug?: string | undefined;
  publishedTitle?: string | undefined;
  hasPublishedVersion: boolean;
  hasDraftChanges: boolean;
  showOutline: boolean;
};

export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  content: PostContent;
  publishedAt: string;
  lastPublishedAt: string;
  showOutline: boolean;
};

export type PublishedPostLookup = {
  post: PublicPost;
  redirectTo?: string | undefined;
};

export class PostsLoadAllError extends Data.TaggedError("PostsLoadAllError")<{
  cause: unknown;
}> {}

export class PostsLoadError extends Data.TaggedError("PostsLoadError")<{
  id: string;
  cause: unknown;
}> {}

export class PostsSaveError extends Data.TaggedError("PostsSaveError")<{
  id: string;
  cause: unknown;
}> {}

export class SlugConflict extends Data.TaggedError("SlugConflict")<{
  slug: string;
}> {}

export class PostsBackfillError extends Data.TaggedError("PostsBackfillError")<{
  cause: unknown;
}> {}

const defaultContent: PostContent = {
  type: "doc",
  content: [{ type: "title" }, { type: "paragraph" }],
};

const postModelName = "posts";

const toIsoString = (value: Date) => value.toISOString();

const toOptionalIsoString = (value: Date | null) =>
  value ? value.toISOString() : undefined;

const toStatus = (value: typeof posts.$inferSelect.status) => value ?? "draft";

const titleNode = (title: string): JSONContent => {
  const text = title.trim();
  return text
    ? { type: "title", content: [{ type: "text", text }] }
    : { type: "title" };
};

const normalizeContent = (content: JSONContent, title: string): JSONContent => {
  if (content.type !== "doc") return content;
  const children = content.content ?? [];
  const hasTitle = children[0]?.type === "title";
  const body = hasTitle ? children.slice(1) : children;
  return {
    ...content,
    content: [
      hasTitle ? children[0]! : titleNode(title),
      ...(body.length ? body : [{ type: "paragraph" }]),
    ],
  };
};

const parseContent = (value: unknown, title: string): PostContent => {
  if (value == null) throw new Error("Post content is required");
  const parsed = normalizeContent(
    typeof value === "string"
      ? (JSON.parse(value) as JSONContent)
      : (value as JSONContent),
    title,
  );
  const result = PostContentSchema["~standard"].validate(parsed);
  if (result instanceof Promise)
    throw new Error("Post content validation must be synchronous");
  if (result.issues) {
    throw new Error(result.issues.map((issue) => issue.message).join("; "));
  }
  return result.value;
};

const parseMutableContent = (value: unknown): JSONContent => {
  if (value == null) throw new Error("Post content is required");
  if (typeof value === "string") {
    return JSON.parse(value) as JSONContent;
  }
  return value as JSONContent;
};

type PostRow = typeof posts.$inferSelect;

const getBaseSlug = (value: string) =>
  slugify(value, { lower: true, strict: true, trim: true }) || "post";

const normalizeSlug = (slug: string | undefined, title: string) =>
  getBaseSlug(slug?.trim() || title);

const parsePublicationDate = (value: string | undefined, fallback: Date) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const sameContent = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const hasDraftChanges = (row: PostRow) => {
  if (!row.publishedSlug || !row.publishedTitle || !row.publishedContent) {
    return true;
  }
  return (
    row.draftSlug !== row.publishedSlug ||
    row.draftTitle !== row.publishedTitle ||
    row.draftShowOutline !== row.publishedShowOutline ||
    !sameContent(row.draftContent, row.publishedContent)
  );
};

const toPost = (row: PostRow): Post => ({
  id: row.id ?? "",
  slug: row.draftSlug,
  title: row.draftTitle,
  status: toStatus(row.status),
  content: parseContent(row.draftContent, row.draftTitle),
  createdAt: toIsoString(row.createdAt ?? new Date(0)),
  updatedAt: toIsoString(row.updatedAt ?? new Date(0)),
  draftUpdatedAt: toIsoString(row.draftUpdatedAt ?? new Date(0)),
  publishedAt: toOptionalIsoString(row.publishedAt),
  lastPublishedAt: toOptionalIsoString(row.lastPublishedAt),
  publishedSlug: row.publishedSlug ?? undefined,
  publishedTitle: row.publishedTitle ?? undefined,
  hasPublishedVersion: Boolean(row.publishedSlug && row.publishedContent),
  hasDraftChanges: hasDraftChanges(row),
  showOutline: row.draftShowOutline,
});

const toPublicPost = (row: PostRow): PublicPost | null => {
  if (
    row.status !== "published" ||
    !row.publishedSlug ||
    !row.publishedTitle ||
    !row.publishedContent ||
    !row.publishedAt ||
    !row.lastPublishedAt
  ) {
    return null;
  }

  return {
    id: row.id ?? "",
    slug: row.publishedSlug,
    title: row.publishedTitle,
    content: parseContent(row.publishedContent, row.publishedTitle),
    publishedAt: toIsoString(row.publishedAt),
    lastPublishedAt: toIsoString(row.lastPublishedAt),
    showOutline: row.publishedShowOutline,
  };
};

const recordNotFound = (id: string) =>
  new RecordNotFound({ model: postModelName, id });

type SlugOwner = { id: string | null; source: "post" | "redirect" };

const findSlugOwner = (db: AppDb, slug: string) =>
  Effect.gen(function* () {
    const postRows = yield* db
      .select({ id: posts.id })
      .from(posts)
      .where(or(eq(posts.draftSlug, slug), eq(posts.publishedSlug, slug)))
      .limit(1);

    if (postRows[0]) {
      return { id: postRows[0].id, source: "post" } satisfies SlugOwner;
    }

    const redirectRows = yield* db
      .select({ postId: postSlugRedirects.postId })
      .from(postSlugRedirects)
      .where(eq(postSlugRedirects.slug, slug))
      .limit(1);

    if (redirectRows[0]) {
      return {
        id: redirectRows[0].postId,
        source: "redirect",
      } satisfies SlugOwner;
    }

    return null;
  });

const ensureSlugAvailable = (db: AppDb, slug: string, postId: string | null) =>
  Effect.gen(function* () {
    const owner = yield* findSlugOwner(db, slug);
    if (!owner || owner.id === postId) return;
    return yield* Effect.fail(new SlugConflict({ slug }));
  });

const getUniqueSlug = (db: AppDb, title: string, postId: string | null) =>
  Effect.gen(function* () {
    const baseSlug = getBaseSlug(title);
    let suffix = 1;

    while (true) {
      const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
      const owner = yield* findSlugOwner(db, slug);
      if (!owner || owner.id === postId) return slug;
      suffix += 1;
    }
  });

const getExistingPost = (db: AppDb, id: string) =>
  Effect.gen(function* () {
    const rows = yield* db.select().from(posts).where(eq(posts.id, id)).limit(1);
    const post = rows[0];
    if (!post) {
      return yield* Effect.fail(recordNotFound(id));
    }
    return post;
  });

const saveRedirect = (db: AppDb, slug: string, postId: string, now: Date) =>
  Effect.gen(function* () {
    const existing = yield* db
      .select({ id: postSlugRedirects.id, postId: postSlugRedirects.postId })
      .from(postSlugRedirects)
      .where(eq(postSlugRedirects.slug, slug))
      .limit(1);

    if (existing[0]?.postId === postId) return;
    if (existing[0]) return yield* Effect.fail(new SlugConflict({ slug }));

    yield* db.insert(postSlugRedirects).values([
      {
        id: randomUUID(),
        slug,
        postId,
        createdAt: now,
      },
    ]);
  });

const removeOwnRedirect = (db: AppDb, slug: string, postId: string) =>
  Effect.gen(function* () {
    const existing = yield* db
      .select({ id: postSlugRedirects.id, postId: postSlugRedirects.postId })
      .from(postSlugRedirects)
      .where(eq(postSlugRedirects.slug, slug))
      .limit(1);

    if (existing[0]?.postId === postId) {
      yield* db
        .delete(postSlugRedirects)
        .where(eq(postSlugRedirects.slug, slug));
    }
  });

export const createDraftPost = (): Post => {
  const now = new Date().toISOString();
  return {
    id: "new",
    slug: "",
    title: "",
    status: "draft",
    content: defaultContent,
    createdAt: now,
    updatedAt: now,
    draftUpdatedAt: now,
    hasPublishedVersion: false,
    hasDraftChanges: true,
    showOutline: false,
  };
};

type PostInput = {
  title: string;
  slug?: string | undefined;
  content: PostContent;
  showOutline: boolean;
  publishedAt?: string | undefined;
};

export type SavePostInput = PostInput & {
  id: string;
};

export const getAllPosts = () =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const rows: ReadonlyArray<PostRow> = yield* db
      .select()
      .from(posts)
      .where(ne(posts.status, "archived"))
      .orderBy(desc(posts.updatedAt));
    return rows.map(toPost);
  }).pipe(Effect.mapError((cause) => new PostsLoadAllError({ cause })));

export const getPublishedPosts = () =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const rows: ReadonlyArray<PostRow> = yield* db
      .select()
      .from(posts)
      .where(eq(posts.status, "published"))
      .orderBy(desc(posts.publishedAt));
    return rows.flatMap((row) => {
      const post = toPublicPost(row);
      return post ? [post] : [];
    });
  }).pipe(Effect.mapError((cause) => new PostsLoadAllError({ cause })));

export const getPostById = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const post = yield* getExistingPost(db, id);
    return toPost(post);
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound
        ? cause
        : new PostsLoadError({ id, cause }),
    ),
  );

export const savePostDraft = (input: SavePostInput) => {
  const id = input.id === "new" ? randomUUID() : input.id;

  return Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const now = new Date();
    const title = input.title.trim();
    const slug = input.slug
      ? normalizeSlug(input.slug, title)
      : yield* getUniqueSlug(db, title, input.id === "new" ? null : id);

    yield* ensureSlugAvailable(db, slug, input.id === "new" ? null : id);

    if (input.id === "new") {
      yield* db.insert(posts).values([
        {
          id,
          status: "draft",
          draftSlug: slug,
          draftTitle: title,
          draftContent: input.content,
          draftShowOutline: input.showOutline,
          draftUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      return { id };
    }

    yield* getExistingPost(db, id);
    yield* db
      .update(posts)
      .set({
        draftSlug: slug,
        draftTitle: title,
        draftContent: input.content,
        draftShowOutline: input.showOutline,
        draftUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(posts.id, id));

    return { id };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound
        ? cause
        : new PostsSaveError({ id, cause }),
    ),
  );
};

export const publishPost = (input: SavePostInput) => {
  const id = input.id === "new" ? randomUUID() : input.id;

  return Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const now = new Date();
    const title = input.title.trim();
    const slug = input.slug
      ? normalizeSlug(input.slug, title)
      : yield* getUniqueSlug(db, title, input.id === "new" ? null : id);

    yield* ensureSlugAvailable(db, slug, input.id === "new" ? null : id);

    if (input.id === "new") {
      const publishedAt = parsePublicationDate(input.publishedAt, now);
      yield* db.insert(posts).values([
        {
          id,
          status: "published",
          draftSlug: slug,
          draftTitle: title,
          draftContent: input.content,
          draftShowOutline: input.showOutline,
          draftUpdatedAt: now,
          publishedSlug: slug,
          publishedTitle: title,
          publishedContent: input.content,
          publishedShowOutline: input.showOutline,
          publishedAt,
          lastPublishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      return { id };
    }

    const existing = yield* getExistingPost(db, id);
    const publishedAt = parsePublicationDate(
      input.publishedAt,
      existing.publishedAt ?? now,
    );
    if (existing.publishedSlug && existing.publishedSlug !== slug) {
      yield* saveRedirect(db, existing.publishedSlug, id, now);
    }
    yield* removeOwnRedirect(db, slug, id);

    yield* db
      .update(posts)
      .set({
        status: "published",
        draftSlug: slug,
        draftTitle: title,
        draftContent: input.content,
        draftShowOutline: input.showOutline,
        draftUpdatedAt: now,
        publishedSlug: slug,
        publishedTitle: title,
        publishedContent: input.content,
        publishedShowOutline: input.showOutline,
        publishedAt,
        lastPublishedAt: now,
        updatedAt: now,
      })
      .where(eq(posts.id, id));

    return { id };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound
        ? cause
        : new PostsSaveError({ id, cause }),
    ),
  );
};

export const unpublishPost = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const existing = yield* getExistingPost(db, id);
    if (!existing.publishedSlug) {
      return yield* Effect.fail(recordNotFound(id));
    }
    yield* db
      .update(posts)
      .set({ status: "unpublished", updatedAt: new Date() })
      .where(eq(posts.id, id));
    return { id };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound ? cause : new PostsSaveError({ id, cause }),
    ),
  );

export const archivePost = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    yield* getExistingPost(db, id);
    yield* db
      .update(posts)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(posts.id, id));
    return { id };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound ? cause : new PostsSaveError({ id, cause }),
    ),
  );

export const discardPostDraft = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const existing = yield* getExistingPost(db, id);
    if (
      !existing.publishedSlug ||
      !existing.publishedTitle ||
      !existing.publishedContent
    ) {
      return yield* Effect.fail(recordNotFound(id));
    }

    const now = new Date();
    yield* db
      .update(posts)
      .set({
        draftSlug: existing.publishedSlug,
        draftTitle: existing.publishedTitle,
        draftContent: existing.publishedContent,
        draftShowOutline: existing.publishedShowOutline,
        draftUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(posts.id, id));
    return { id };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound ? cause : new PostsSaveError({ id, cause }),
    ),
  );

export const getPublishedPostBySlug = (slug: string) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const rows = yield* db
      .select()
      .from(posts)
      .where(and(eq(posts.status, "published"), eq(posts.publishedSlug, slug)))
      .limit(1);
    const directPost = rows[0] ? toPublicPost(rows[0]) : null;
    if (directPost) return { post: directPost } satisfies PublishedPostLookup;

    const redirectRows = yield* db
      .select({ postId: postSlugRedirects.postId })
      .from(postSlugRedirects)
      .where(eq(postSlugRedirects.slug, slug))
      .limit(1);
    const redirect = redirectRows[0];
    if (!redirect) return yield* Effect.fail(recordNotFound(slug));

    const targetRows = yield* db
      .select()
      .from(posts)
      .where(and(eq(posts.id, redirect.postId), eq(posts.status, "published")))
      .limit(1);
    const targetPost = targetRows[0] ? toPublicPost(targetRows[0]) : null;
    if (!targetPost) return yield* Effect.fail(recordNotFound(slug));

    return {
      post: targetPost,
      redirectTo: targetPost.slug,
    } satisfies PublishedPostLookup;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound
        ? cause
        : new PostsLoadError({ id: slug, cause }),
    ),
  );

type ImageDimensions = ReadonlyMap<string, { width: number; height: number }>;

export const addPostImageDimensions = (
  node: JSONContent,
  dimensions: ImageDimensions,
): { content: JSONContent; changed: boolean } => {
  let changed = false;
  const content = node.content?.map((child) => {
    const result = addPostImageDimensions(child, dimensions);
    changed ||= result.changed;
    return result.content;
  });

  if (node.type !== "image") {
    return { content: content ? { ...node, content } : node, changed };
  }

  const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  const match = /^\/images\/([^/?#]+)$/.exec(src);
  const size = match ? dimensions.get(match[1]) : undefined;
  if (
    !size ||
    (node.attrs?.width === size.width && node.attrs?.height === size.height)
  ) {
    return { content: content ? { ...node, content } : node, changed };
  }

  return {
    content: {
      ...node,
      attrs: { ...node.attrs, width: size.width, height: size.height },
      ...(content ? { content } : {}),
    },
    changed: true,
  };
};

export const backfillPostImageDimensions = (dimensions: ImageDimensions) =>
  Effect.gen(function* () {
    const db = yield* Effect.service(DB);
    const rows: ReadonlyArray<PostRow> = yield* db.select().from(posts);
    let updated = 0;

    yield* Effect.forEach(
      rows,
      (row) => {
        const draftResult = addPostImageDimensions(
          parseMutableContent(row.draftContent),
          dimensions,
        );
        const publishedResult = row.publishedContent
          ? addPostImageDimensions(parseMutableContent(row.publishedContent), dimensions)
          : null;
        const changed = draftResult.changed || Boolean(publishedResult?.changed);
        if (!changed || !row.id) return Effect.void;
        updated += 1;
        return db
          .update(posts)
          .set({
            draftContent: draftResult.content,
            ...(publishedResult?.changed
              ? { publishedContent: publishedResult.content }
              : {}),
          })
          .where(eq(posts.id, row.id!));
      },
      { concurrency: 1 },
    );

    return { updated };
  }).pipe(Effect.mapError((cause) => new PostsBackfillError({ cause })));
