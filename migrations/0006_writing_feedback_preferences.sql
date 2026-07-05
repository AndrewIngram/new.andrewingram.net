CREATE TABLE `writing_feedback_suppressions` (
  `id` text,
  `post_id` text REFERENCES `posts`(`id`) ON DELETE cascade,
  `scope` text NOT NULL,
  `key_kind` text NOT NULL,
  `key` text NOT NULL,
  `kind` text NOT NULL,
  `message` text NOT NULL,
  `example_text` text,
  `created_at` integer NOT NULL,
  CONSTRAINT `writing_feedback_suppressions_scope_check` CHECK (
    (`post_id` IS NOT NULL AND `scope` = 'post' AND `key_kind` = 'context_hash') OR
    (`post_id` IS NULL AND `scope` = 'global' AND `key_kind` = 'pattern')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_feedback_suppressions_post_unique` ON `writing_feedback_suppressions` (`post_id`, `key_kind`, `key`) WHERE `post_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_feedback_suppressions_global_unique` ON `writing_feedback_suppressions` (`key_kind`, `key`) WHERE `post_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `writing_feedback_dictionary_words` (
  `id` text,
  `post_id` text REFERENCES `posts`(`id`) ON DELETE cascade,
  `word_key` text NOT NULL,
  `word` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_feedback_dictionary_words_post_unique` ON `writing_feedback_dictionary_words` (`post_id`, `word_key`) WHERE `post_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `writing_feedback_dictionary_words_global_unique` ON `writing_feedback_dictionary_words` (`word_key`) WHERE `post_id` IS NULL;
