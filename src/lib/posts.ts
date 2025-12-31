import { Effect } from "effect";
import * as Schema from "effect/Schema";
import type { JSONContent } from "@tiptap/core";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileSystem } from "@effect/platform";

const PostStatusSchema = Schema.Literal("draft", "published", "archived");
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
export type Post = Omit<PostFromSchema, "content"> & { content: JSONContent };

const DATA_ROOT = process.env.POSTS_DATA_DIR ?? process.cwd();
const DATA_DIR = path.join(DATA_ROOT, "data", "posts");

const defaultContent: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

type FsError = NodeJS.ErrnoException;

const ensureDataDir = Effect.gen(function* (_) {
  const fs = yield* FileSystem.FileSystem;
  yield* _(fs.makeDirectory(DATA_DIR, { recursive: true }));
});

const parseJson = (input: string): Effect.Effect<any, Error, never> =>
  Effect.try({
    // JSON.parse may throw for bad input
    try: () => JSON.parse(input),
    // remap the error
    catch: (_unknown) =>
      new Error(`something went wrong while parsing the JSON`),
  });

const decodePost = (raw: string, label: string) =>
  Effect.gen(function* (_) {
    const decoded = yield* _(Schema.decodeUnknown(PostSchema)(raw));
    return {
      ...decoded,
      content: decoded.content as JSONContent,
    };
  }).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to decode "${label}": ${String(error)}`)
    )
  );

const isNoEntryError = (error: unknown): error is FsError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as FsError).code === "ENOENT";

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

export const getAllPosts = () =>
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    yield* _(ensureDataDir);
    const entries = yield* fs.readDirectory(DATA_DIR);
    const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
    const posts = yield* _(
      Effect.forEach(
        jsonFiles,
        (entry) =>
          Effect.gen(function* (_) {
            const filePath = path.join(DATA_DIR, entry);
            const raw = yield* fs.readFileString(filePath);
            const json = yield* _(parseJson(raw));
            return yield* _(decodePost(json, entry));
          }),
        { concurrency: "unbounded" }
      )
    );
    return posts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to load posts: ${String(error)}`)
    )
  );

export const getPostById = (id: string) =>
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    yield* _(ensureDataDir);
    const raw = yield* fs.readFileString(path.join(DATA_DIR, `${id}.json`));
    const json = yield* _(parseJson(raw));
    return yield* _(decodePost(json, id));
  }).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to load post "${id}": ${String(error)}`)
    )
  );

export type SavePostInput = {
  id: string;
  title: string;
  status: PostStatus;
  content: JSONContent;
  publishedAt?: string;
};

export const savePost = (input: SavePostInput) =>
  Effect.gen(function* (_) {
    const fs = yield* FileSystem.FileSystem;
    yield* _(ensureDataDir);
    const now = new Date().toISOString();
    const id = input.id === "new" ? randomUUID() : input.id;
    const filePath = path.join(DATA_DIR, `${id}.json`);

    const existing = yield* _(
      Effect.gen(function* (_) {
        const fs = yield* FileSystem.FileSystem;
        const raw = yield* fs.readFileString(filePath);
        const json = yield* _(parseJson(raw));
        return yield* _(decodePost(json, filePath));
      }).pipe(Effect.catchTag("SystemError", (error) => Effect.succeed(null)))
    );

    const post: Post = {
      id,
      title: input.title.trim(),
      status: input.status,
      content: input.content ?? defaultContent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      publishedAt:
        input.publishedAt?.trim() ||
        existing?.publishedAt ||
        (input.status === "published" ? now : undefined),
    };

    yield* _(fs.writeFileString(filePath, JSON.stringify(post, null, 2)));
    return { id };
  }).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to save post: ${String(error)}`)
    )
  );
