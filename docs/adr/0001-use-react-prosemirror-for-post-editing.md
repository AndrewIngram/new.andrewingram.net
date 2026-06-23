# Use React ProseMirror for post editing

The post editor will move from Tiptap to React ProseMirror while keeping post authoring centered on structured rich content rather than editor-specific state. We accept breaking existing persisted post content during this migration so the editor can use a simpler HTML-like figure schema (`figure`, `image`, `figcaption`) with inline editable captions and direct ProseMirror commands.

**Consequences**

Existing post content may need manual repair after deploy. The public renderer should target the new post content schema rather than carrying old `imageBlock` compatibility.
