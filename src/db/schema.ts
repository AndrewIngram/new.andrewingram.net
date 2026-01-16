import { integer, blob, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

export const posts = sqliteTable("posts", {
  id: text().$defaultFn(() => createId()),
  title: text("title").notNull(),
  content: blob({ mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
