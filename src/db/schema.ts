import {
  check,
  customType,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";

const decodeJsonBlob = (value: unknown): unknown => {
  if (typeof value === "string") {
    const text =
      value.length % 2 === 0 && /^[\da-f]+$/i.test(value)
        ? new TextDecoder().decode(
            Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16)),
          )
        : value;
    return JSON.parse(text);
  }

  const bytes =
    value instanceof Uint8Array
      ? value
      : Array.isArray(value)
        ? Uint8Array.from(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : undefined;

  if (!bytes) throw new Error("Unsupported JSON blob value");

  return JSON.parse(new TextDecoder().decode(bytes));
};

const jsonBlob = customType<{
  data: unknown;
  driverData: Uint8Array;
  driverOutput: ArrayBuffer | Uint8Array | number[] | string;
}>({
  dataType: () => "blob",
  toDriver: (value) => new TextEncoder().encode(JSON.stringify(value)),
  fromDriver: decodeJsonBlob,
  fromJson: decodeJsonBlob,
});

const timestamp = customType<{
  data: Date;
  driverData: number;
  driverOutput: number | string;
}>({
  dataType: () => "integer",
  toDriver: (value) => value.getTime(),
  fromDriver: (value) => {
    const timestamp = typeof value === "string" ? Number(value) : value;
    return new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp);
  },
});

export const posts = sqliteTable(
  "posts",
  {
    id: text().$defaultFn(() => createId()),
    status: text({ enum: ["draft", "published", "unpublished", "archived"] })
      .notNull()
      .default("draft"),
    draftSlug: text("draft_slug").notNull(),
    draftTitle: text("draft_title").notNull(),
    draftContent: jsonBlob("draft_content").notNull(),
    draftShowOutline: integer("draft_show_outline", { mode: "boolean" })
      .notNull()
      .default(false),
    draftUpdatedAt: timestamp("draft_updated_at").notNull(),
    publishedSlug: text("published_slug"),
    publishedTitle: text("published_title"),
    publishedContent: jsonBlob("published_content"),
    publishedShowOutline: integer("published_show_outline", { mode: "boolean" })
      .notNull()
      .default(false),
    publishedAt: timestamp("published_at"),
    lastPublishedAt: timestamp("last_published_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("posts_id_unique").on(table.id),
    uniqueIndex("posts_draft_slug_unique").on(table.draftSlug),
    uniqueIndex("posts_published_slug_unique").on(table.publishedSlug),
  ],
);

export const postSlugRedirects = sqliteTable(
  "post_slug_redirects",
  {
    id: text().$defaultFn(() => createId()),
    slug: text("slug").notNull(),
    postId: text("post_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("post_slug_redirects_slug_unique").on(table.slug)],
);

export const writingFeedbackSuppressions = sqliteTable(
  "writing_feedback_suppressions",
  {
    id: text().$defaultFn(() => createId()),
    postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
    scope: text({ enum: ["post", "global"] }).notNull(),
    keyKind: text("key_kind", { enum: ["context_hash", "pattern"] }).notNull(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    exampleText: text("example_text"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    check(
      "writing_feedback_suppressions_scope_check",
      sql`(${table.postId} IS NOT NULL AND ${table.scope} = 'post' AND ${table.keyKind} = 'context_hash') OR (${table.postId} IS NULL AND ${table.scope} = 'global' AND ${table.keyKind} = 'pattern')`,
    ),
    uniqueIndex("writing_feedback_suppressions_post_unique")
      .on(table.postId, table.keyKind, table.key)
      .where(sql`${table.postId} IS NOT NULL`),
    uniqueIndex("writing_feedback_suppressions_global_unique")
      .on(table.keyKind, table.key)
      .where(sql`${table.postId} IS NULL`),
  ],
);

export const writingFeedbackDictionaryWords = sqliteTable(
  "writing_feedback_dictionary_words",
  {
    id: text().$defaultFn(() => createId()),
    postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
    wordKey: text("word_key").notNull(),
    word: text("word").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("writing_feedback_dictionary_words_post_unique")
      .on(table.postId, table.wordKey)
      .where(sql`${table.postId} IS NOT NULL`),
    uniqueIndex("writing_feedback_dictionary_words_global_unique")
      .on(table.wordKey)
      .where(sql`${table.postId} IS NULL`),
  ],
);
