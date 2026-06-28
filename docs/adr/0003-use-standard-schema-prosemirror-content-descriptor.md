# Use Standard Schema ProseMirror content descriptor

Post content will be defined by a typed ProseMirror content descriptor rather than by raw ProseMirror specs or an Effect/Zod schema. The descriptor is the source of truth for node names, mark names, attrs, content rules, mark policy, and ProseMirror DOM metadata.

The descriptor generates the editor's ProseMirror schema and a Standard Schema-compatible validator for serialized Post content. This keeps validation-library choice out of the editor model while still letting consumers infer strong TypeScript types and validate JSON boundaries.

**Consequences**

Post content validation is parent-aware: text marks are accepted or rejected according to the parent node that contains the text. Persisted Post content should be valid before rendering or editing, so null or malformed saved content is treated as a data error rather than silently repaired.
