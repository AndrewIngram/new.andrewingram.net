# Embed CodeMirror for code block editing

The CMS will edit Code blocks with embedded CodeMirror node views rather than plain ProseMirror textblocks or modern-monaco. Gutter-based line range selection is core authoring UX, and CodeMirror gives us inline editors, language extensions, gutter events, and line decorations without bringing Monaco's larger IDE surface into rich Post content.

**Considered Options**

- Plain ProseMirror textblocks: simpler persistence, but line gutter selection and full-line editor previews would become custom editor work.
- modern-monaco: strong editor and Shiki alignment, but heavier than needed for inline Post content and less aligned with the existing React ProseMirror stack.
