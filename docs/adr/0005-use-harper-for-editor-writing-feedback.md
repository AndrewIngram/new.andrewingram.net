# Use Harper for editor Writing feedback

The CMS will use bundled `harper.js` with `WorkerLinter` for editor-only **Writing feedback** in British English. Harper owns spelling as well as grammar and style feedback, so browser spellcheck is disabled in the Post editor to avoid duplicate underlines.

Writing feedback preferences are stored outside Post content in two tables: suppressions and dictionary words. Both support nullable `post_id`: a Post id makes the preference Post-scoped, and `null` makes it global across the CMS.

**Consequences**

Harper runs in the browser and does not change **Post content** or saved Post data. The dependency is bundled rather than loaded from a CDN so local editing remains reproducible and privacy-preserving.

Dictionary words are imported into the active Harper linter with `importWords()`. Suppressions are applied by filtering Harper lints: Post-scoped suppressions use Harper context hashes, and global suppressions use normalized pattern keys that include the lint rule, message shape, suggestion kinds, and example text.

Writing feedback preferences do not affect a **Draft version**, **Published version**, `hasDraftChanges`, or public rendering.
