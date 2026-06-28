PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text,
	`slug` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`content` blob NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "slug", "status", "title", "content", "created_at", "updated_at") SELECT "id", "slug", "status", "title", COALESCE("content", '{"type":"doc","content":[{"type":"title"},{"type":"paragraph"}]}'), "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);
