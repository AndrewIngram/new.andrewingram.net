import { type Node as ProseMirrorNode } from "prosemirror-model";
import { migrateCodeBlockLanguageHints } from "@/lib/code-blocks";
import { createProseMirrorSchema } from "@/lib/prosemirror-content";
import { postContent, type PostContent } from "@/lib/post-content-schema";
import type { JSONContent } from "@/lib/post-content-json";

export const postSchema = createProseMirrorSchema(postContent);

const titleNode = (title = "") =>
  title
    ? postSchema.nodes.title.create(null, postSchema.text(title))
    : postSchema.nodes.title.create();

const paragraphNode = () => postSchema.nodes.paragraph.create();

export const createDefaultDoc = (title = "") =>
  postSchema.nodes.doc.create(null, [titleNode(title), paragraphNode()]);

export const normalizePostDoc = (
  content: JSONContent | null | undefined,
  title: string,
): ProseMirrorNode => {
  if (content?.type === "doc") {
    try {
      const migrated = migrateCodeBlockLanguageHints(content);
      const parsed = postSchema.nodeFromJSON(migrated);
      const nodes: ProseMirrorNode[] = [];
      const first = parsed.childCount > 0 ? parsed.child(0) : null;

      nodes.push(first?.type === postSchema.nodes.title ? first : titleNode(title));

      for (
        let index = first?.type === postSchema.nodes.title ? 1 : 0;
        index < parsed.childCount;
        index += 1
      ) {
        nodes.push(parsed.child(index));
      }

      if (nodes.length === 1) nodes.push(paragraphNode());
      return postSchema.nodes.doc.create(null, nodes);
    } catch {
      return createDefaultDoc(title);
    }
  }

  return createDefaultDoc(title);
};

export const docToJSON = (doc: ProseMirrorNode): PostContent => doc.toJSON() as PostContent;

export const extractTitle = (content: JSONContent | null | undefined) => {
  const nodes = content?.content ?? [];
  const title = nodes.find((node) => node.type === "title");
  return (
    title?.content?.map((node) => (node.type === "text" ? (node.text ?? "") : "")).join("") ?? ""
  );
};
