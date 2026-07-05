PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft_slug` text NOT NULL,
	`draft_title` text NOT NULL,
	`draft_content` blob NOT NULL,
	`draft_updated_at` integer NOT NULL,
	`published_slug` text,
	`published_title` text,
	`published_content` blob,
	`published_at` integer,
	`last_published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_posts`(
	"id",
	"status",
	"draft_slug",
	"draft_title",
	"draft_content",
	"draft_updated_at",
	"published_slug",
	"published_title",
	"published_content",
	"published_at",
	"last_published_at",
	"created_at",
	"updated_at"
)
SELECT
	"id",
	"status",
	COALESCE(NULLIF("slug", ''), "id"),
	"title",
	"content",
	"updated_at",
	CASE WHEN "status" = 'published' THEN COALESCE(NULLIF("slug", ''), "id") ELSE NULL END,
	CASE WHEN "status" = 'published' THEN "title" ELSE NULL END,
	CASE WHEN "status" = 'published' THEN "content" ELSE NULL END,
	CASE WHEN "status" = 'published' THEN "created_at" ELSE NULL END,
	CASE WHEN "status" = 'published' THEN "updated_at" ELSE NULL END,
	"created_at",
	"updated_at"
FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_draft_slug_unique` ON `posts` (`draft_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_published_slug_unique` ON `posts` (`published_slug`);--> statement-breakpoint
CREATE TABLE `post_slug_redirects` (
	`id` text,
	`slug` text NOT NULL,
	`post_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_slug_redirects_slug_unique` ON `post_slug_redirects` (`slug`);
