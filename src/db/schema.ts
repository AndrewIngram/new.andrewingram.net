import {
  customType,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

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
    slug: text("slug"),
    status: text({ enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    title: text("title").notNull(),
    content: jsonBlob("content").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [uniqueIndex("posts_slug_unique").on(table.slug)],
);
