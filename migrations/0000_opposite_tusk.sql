CREATE TABLE `posts` (
	`id` text,
	`title` text NOT NULL,
	`content` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
