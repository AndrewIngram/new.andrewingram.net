import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import slugify from "slugify";
import { getDbAsync } from "@/db";
import { posts } from "@/db/schema";
import { RecordNotFound } from "./errors";
import { PostContentSchema, type PostContent } from "./post-content-schema";
import type { JSONContent } from "./post-content-json";

const PostStatusSchema = Schema.Literals(["draft", "published", "archived"]);
const PostSchema = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  status: PostStatusSchema,
  content: Schema.Unknown,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  publishedAt: Schema.optional(Schema.String),
});

type PostFromSchema = Schema.Schema.Type<typeof PostSchema>;
export type PostStatus = Schema.Schema.Type<typeof PostStatusSchema>;
export type Post = Omit<PostFromSchema, "content"> & {
  content: PostContent;
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

export class PostsBackfillError extends Data.TaggedError("PostsBackfillError")<{
  cause: unknown;
}> {}

const defaultContent: PostContent = {
  type: "doc",
  content: [{ type: "title" }, { type: "paragraph" }],
};

const postModelName = "posts";

const toIsoString = (value: Date) => value.toISOString();

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

type Db = Awaited<ReturnType<typeof getDbAsync>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type PostRow = typeof posts.$inferSelect;

const getBaseSlug = (title: string) =>
  slugify(title, { lower: true, strict: true, trim: true }) || "post";

const getUniqueSlug = async (
  db: Db | Tx,
  title: string,
  excludeId?: string | null,
) => {
  const baseSlug = getBaseSlug(title);
  let suffix = 1;

  while (true) {
    const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const rows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        excludeId
          ? and(eq(posts.slug, slug), ne(posts.id, excludeId))
          : eq(posts.slug, slug),
      )
      .limit(1);

    if (rows.length === 0) return slug;
    suffix += 1;
  }
};

const toPost = (row: typeof posts.$inferSelect): Post => ({
  id: row.id ?? "",
  slug: row.slug ?? "",
  title: row.title ?? "",
  status: toStatus(row.status),
  content: parseContent(row.content, row.title ?? ""),
  createdAt: toIsoString(row.createdAt ?? new Date(0)),
  updatedAt: toIsoString(row.updatedAt ?? new Date(0)),
});

const ensurePostSlug = async (db: Db, row: PostRow): Promise<Post> => {
  if (row.slug) return toPost(row);
  const id = row.id ?? "";
  const slug = await getUniqueSlug(db, row.title, id);
  await db.update(posts).set({ slug }).where(eq(posts.id, id));
  return toPost({ ...row, slug });
};

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
  };
};

type PostInput = {
  title: string;
  status: PostStatus;
  content: PostContent;
  publishedAt?: string | undefined;
};

export type CreatePostInput = PostInput;
export type UpdatePostInput = PostInput & {
  id: string;
};
export type SavePostInput = PostInput & {
  id: string;
};

const getDb = () => Effect.tryPromise(() => getDbAsync());

const recordNotFound = (id: string) =>
  new RecordNotFound({ model: postModelName, id });

export const getAllPosts = () =>
  Effect.gen(function* () {
    const db = yield* getDb();
    const rows = yield* Effect.tryPromise(() =>
      db.select().from(posts).orderBy(desc(posts.updatedAt)),
    );
    return yield* Effect.tryPromise(() =>
      Promise.all(rows.map((row) => ensurePostSlug(db, row))),
    );
  }).pipe(Effect.mapError((cause) => new PostsLoadAllError({ cause })));

export const getPostById = (id: string) =>
  Effect.gen(function* () {
    const db = yield* getDb();
    const rows = yield* Effect.tryPromise(() =>
      db.select().from(posts).where(eq(posts.id, id)).limit(1),
    );
    const post = rows[0];
    if (!post) {
      return yield* Effect.fail(recordNotFound(id));
    }
    return yield* Effect.tryPromise(() => ensurePostSlug(db, post));
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound
        ? cause
        : new PostsLoadError({ id, cause }),
    ),
  );

export const createPost = (input: CreatePostInput) => {
  const id = randomUUID();

  return Effect.gen(function* () {
    const db = yield* getDb();
    const now = new Date();
    const slug = yield* Effect.tryPromise(() => getUniqueSlug(db, input.title));
    yield* Effect.tryPromise(() =>
      db.insert(posts).values([
        {
          id,
          slug,
          title: input.title.trim(),
          status: input.status,
          content: input.content,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );
    return { id };
  }).pipe(Effect.mapError((cause) => new PostsSaveError({ id, cause })));
};

export const updatePost = (input: UpdatePostInput) =>
  Effect.gen(function* () {
    const db = yield* getDb();
    const now = new Date();
    return yield* Effect.tryPromise(async () => {
      const existing = await db
        .select()
        .from(posts)
        .where(eq(posts.id, input.id))
        .limit(1);

      if (!existing[0]) {
        throw recordNotFound(input.id);
      }

      const slug =
        existing[0].slug ?? (await getUniqueSlug(db, input.title, input.id));

      await db
        .update(posts)
        .set({
          slug,
          title: input.title.trim(),
          status: input.status,
          content: input.content,
          updatedAt: now,
        })
        .where(eq(posts.id, input.id));

      return { id: input.id };
    });
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound
        ? cause
        : new PostsSaveError({ id: input.id, cause }),
    ),
  );

export const getPostBySlug = (slug: string) =>
  Effect.gen(function* () {
    const db = yield* getDb();
    const rows = yield* Effect.tryPromise(() =>
      db.select().from(posts).where(eq(posts.slug, slug)).limit(1),
    );
    const post = rows[0];
    if (!post) {
      return yield* Effect.fail(recordNotFound(slug));
    }
    return toPost(post);
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
    const db = yield* getDb();
    const rows = yield* Effect.tryPromise(() => db.select().from(posts));
    let updated = 0;

    yield* Effect.forEach(
      rows,
      (row) => {
        const result = addPostImageDimensions(
          parseMutableContent(row.content),
          dimensions,
        );
        if (!result.changed || !row.id) return Effect.void;
        updated += 1;
        return Effect.tryPromise(() =>
          db
            .update(posts)
            .set({ content: result.content })
            .where(eq(posts.id, row.id!)),
        );
      },
      { concurrency: 1 },
    );

    return { updated };
  }).pipe(Effect.mapError((cause) => new PostsBackfillError({ cause })));
