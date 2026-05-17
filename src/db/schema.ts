import { integer, blob, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

export const posts = sqliteTable("posts", {
  id: text().$defaultFn(() => createId()),
  status: text({ enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft"),
  title: text("title").notNull(),
  content: blob({ mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
