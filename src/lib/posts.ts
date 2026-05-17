import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import type { JSONContent } from "@tiptap/core";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDbAsync } from "@/db";
import { posts } from "@/db/schema";
import { RecordNotFound } from "./errors";

const PostStatusSchema = Schema.Literals(["draft", "published", "archived"]);
const PostSchema = Schema.Struct({
  id: Schema.String,
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
  content: JSONContent;
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

const defaultContent: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const postModelName = "posts";

const toIsoString = (value: Date) => value.toISOString();

const toStatus = (value: typeof posts.$inferSelect.status) => value ?? "draft";

const parseContent = (value: unknown): JSONContent => {
  if (value == null) return defaultContent;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as JSONContent;
    } catch {
      return defaultContent;
    }
  }
  return value as JSONContent;
};

const toPost = (row: typeof posts.$inferSelect): Post => ({
  id: row.id ?? "",
  title: row.title ?? "",
  status: toStatus(row.status),
  content: parseContent(row.content),
  createdAt: toIsoString(row.createdAt ?? new Date(0)),
  updatedAt: toIsoString(row.updatedAt ?? new Date(0)),
});

export const createDraftPost = (): Post => {
  const now = new Date().toISOString();
  return {
    id: "new",
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
  content: JSONContent;
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

const recordNotFound = (id: string) => new RecordNotFound({ model: postModelName, id });

export const getAllPosts = () =>
  Effect.gen(function* () {
    const db = yield* getDb();
    const rows = yield* Effect.tryPromise(() =>
      db.select().from(posts).orderBy(desc(posts.updatedAt)),
    );
    return rows.map((row) => toPost(row));
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
    return toPost(post);
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound ? cause : new PostsLoadError({ id, cause }),
    ),
  );

export const createPost = (input: CreatePostInput) => {
  const id = randomUUID();

  return Effect.gen(function* () {
    const db = yield* getDb();
    const now = new Date();
    yield* Effect.tryPromise(() =>
      db.insert(posts).values([
        {
          id,
          title: input.title.trim(),
          status: input.status,
          content: input.content ?? defaultContent,
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
    return yield* Effect.tryPromise(() =>
      db.transaction(async (tx) => {
        const existing = await tx.select().from(posts).where(eq(posts.id, input.id)).limit(1);

        if (!existing[0]) {
          throw recordNotFound(input.id);
        }

        await tx
          .update(posts)
          .set({
            title: input.title.trim(),
            status: input.status,
            content: input.content ?? defaultContent,
            updatedAt: now,
          })
          .where(eq(posts.id, input.id));

        return { id: input.id };
      }),
    );
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof RecordNotFound ? cause : new PostsSaveError({ id: input.id, cause }),
    ),
  );
