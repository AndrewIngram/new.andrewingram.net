import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import type { JSONContent } from "@tiptap/core";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileSystem } from "@effect/platform";
import { decodeJson, parseJson } from "./json";

const PostStatusSchema = Schema.Literal("draft", "published", "archived");
const PostTypeSchema = Schema.Literal("long", "short", "reaction");
const PostMetaSchema = Schema.Struct({
  sourceKind: Schema.optional(Schema.Literal("tweet", "url", "video")),
  sourceUrl: Schema.optional(Schema.String),
});
const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: PostStatusSchema,
  content: Schema.Unknown,
  type: Schema.optional(PostTypeSchema),
  meta: Schema.optional(PostMetaSchema),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  publishedAt: Schema.optional(Schema.String),
});

type PostFromSchema = Schema.Schema.Type<typeof PostSchema>;
export type PostStatus = Schema.Schema.Type<typeof PostStatusSchema>;
export type PostType = Schema.Schema.Type<typeof PostTypeSchema>;
export type PostMeta = Schema.Schema.Type<typeof PostMetaSchema>;
export type Post = Omit<PostFromSchema, "content" | "type" | "meta"> & {
  content: JSONContent;
  type: PostType;
  meta: PostMeta;
};

export class PostsParseError extends Data.TaggedError("PostsParseError")<{
  cause: unknown;
}> {}

export class PostsDecodeError extends Data.TaggedError("PostsDecodeError")<{
  label: string;
  cause: unknown;
}> {}

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

const DATA_ROOT = process.env.POSTS_DATA_DIR ?? process.cwd();
const DATA_DIR = path.join(DATA_ROOT, "data", "posts");

const defaultContent: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const ensureDataDir = Effect.gen(function* (_) {
  const fs = yield* FileSystem.FileSystem;
  yield* _(fs.makeDirectory(DATA_DIR, { recursive: true }));
});

const parsePostJson = (input: string) => parseJson(input);

const decodePost = (
  raw: unknown,
  label: string
): Effect.Effect<Post, PostsDecodeError> =>
  decodeJson(
    PostSchema,
    raw,
    (cause) => new PostsDecodeError({ label, cause })
  ).pipe(
    Effect.map((decoded) => ({
      ...decoded,
      content: decoded.content as JSONContent,
      type: decoded.type ?? "long",
      meta: decoded.meta ?? {},
    }))
  );

const isNoEntryError = (
  error: unknown
): error is {
  readonly _tag: "SystemError";
  readonly reason: "NotFound";
} =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  "reason" in error &&
  (error as { _tag?: string })._tag === "SystemError" &&
  (error as { reason?: string }).reason === "NotFound";

export const createDraftPost = (): Post => {
  const now = new Date().toISOString();
  return {
    id: "new",
    title: "",
    status: "draft",
    content: defaultContent,
    type: "long",
    meta: {},
    createdAt: now,
    updatedAt: now,
  };
};

export type SavePostInput = {
  id: string;
  title: string;
  status: PostStatus;
  content: JSONContent;
  type: PostType;
  meta?: PostMeta;
  publishedAt?: string;
};

export class Posts extends Effect.Service<Posts>()("Posts", {
  accessors: true,
  effect: Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;

    const readPostFile = (filePath: string, label: string) =>
      fs.readFileString(filePath).pipe(
        Effect.flatMap(parsePostJson),
        Effect.flatMap((json) => decodePost(json, label))
      );

    const getAllPosts = () =>
      Effect.gen(function* (_) {
        yield* _(ensureDataDir);
        const entries = yield* fs.readDirectory(DATA_DIR);
        const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
        const posts = yield* _(
          Effect.forEach(
            jsonFiles,
            (entry) => readPostFile(path.join(DATA_DIR, entry), entry),
            { concurrency: "unbounded" }
          )
        );
        return posts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }).pipe(
        Effect.catchTag("SystemError", (cause) =>
          Effect.fail(new PostsLoadAllError({ cause }))
        )
      );

    const getPostById = (id: string) =>
      Effect.gen(function* (_) {
        yield* _(ensureDataDir);
        return yield* _(readPostFile(path.join(DATA_DIR, `${id}.json`), id));
      }).pipe(
        Effect.catchTag("SystemError", (cause) =>
          Effect.fail(new PostsLoadError({ id, cause }))
        )
      );

    const savePost = (input: SavePostInput) => {
      const resolvedId = input.id === "new" ? randomUUID() : input.id;

      return Effect.gen(function* (_) {
        yield* _(ensureDataDir);
        const now = new Date().toISOString();
        const filePath = path.join(DATA_DIR, `${resolvedId}.json`);

        const existing = yield* _(
          readPostFile(filePath, filePath).pipe(
            Effect.catchTag("SystemError", (cause) =>
              isNoEntryError(cause)
                ? Effect.succeed(null)
                : Effect.fail(new PostsSaveError({ id: resolvedId, cause }))
            )
          )
        );

        const post: Post = {
          id: resolvedId,
          title: input.title.trim(),
          status: input.status,
          content: input.content ?? defaultContent,
          type: input.type ?? existing?.type ?? "long",
          meta: input.meta ?? existing?.meta ?? {},
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          publishedAt:
            input.publishedAt?.trim() ||
            existing?.publishedAt ||
            (input.status === "published" ? now : undefined),
        };

        yield* _(fs.writeFileString(filePath, JSON.stringify(post, null, 2)));
        return { id: resolvedId };
      }).pipe(
        Effect.catchTags({
          SystemError: (cause) =>
            Effect.fail(new PostsSaveError({ id: resolvedId, cause })),
          JSONParseError: (cause) =>
            Effect.fail(new PostsSaveError({ id: resolvedId, cause })),
          PostsDecodeError: (cause) =>
            Effect.fail(new PostsSaveError({ id: resolvedId, cause })),
        })
      );
    };

    return { getAllPosts, getPostById, savePost };
  }),
}) {}

export const PostsLive = Posts.Default;

export const getAllPosts = () =>
  Posts.getAllPosts().pipe(Effect.provide(PostsLive));
export const getPostById = (id: string) =>
  Posts.getPostById(id).pipe(Effect.provide(PostsLive));
export const savePost = (input: SavePostInput) =>
  Posts.savePost(input).pipe(Effect.provide(PostsLive));
