ALTER TABLE `posts` ADD `slug` text;
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);
