import { Schema, type Node as ProseMirrorNode } from "prosemirror-model";
import {
  DEFAULT_CODE_LANGUAGE,
  migrateCodeBlockLanguageHints,
  normalizeHighlightRanges,
} from "@/lib/code-blocks";
import type { JSONContent } from "@/lib/post-content-json";

export const postSchema = new Schema({
  nodes: {
    doc: { content: "title block+" },
    title: {
      group: "title",
      content: "text*",
      marks: "",
      defining: true,
      toDOM: () => ["h1", { "data-node": "title" }, 0],
      parseDOM: [{ tag: "h1[data-node='title']" }, { tag: "post-title" }],
    },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 2 } },
      defining: true,
      toDOM: (node) => [`h${node.attrs.level}`, 0],
      parseDOM: [
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
      ],
    },
    blockquote: {
      group: "block",
      content: "block+",
      defining: true,
      toDOM: () => ["blockquote", 0],
      parseDOM: [{ tag: "blockquote" }],
    },
    bulletList: {
      group: "block",
      content: "listItem+",
      toDOM: () => ["ul", 0],
      parseDOM: [{ tag: "ul" }],
    },
    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { order: { default: 1 } },
      toDOM: (node) =>
        node.attrs.order === 1 ? ["ol", 0] : ["ol", { start: node.attrs.order }, 0],
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (node) => ({
            order:
              node instanceof HTMLOListElement && node.hasAttribute("start")
                ? Number(node.getAttribute("start"))
                : 1,
          }),
        },
      ],
    },
    listItem: {
      content: "paragraph block*",
      defining: true,
      toDOM: () => ["li", 0],
      parseDOM: [{ tag: "li" }],
    },
    codeBlock: {
      group: "block",
      content: "text*",
      attrs: {
        language: { default: DEFAULT_CODE_LANGUAGE },
        highlightRanges: { default: [] },
      },
      marks: "",
      code: true,
      defining: true,
      isolating: true,
      selectable: true,
      toDOM: (node) => [
        "pre",
        {
          "data-language": node.attrs.language,
          "data-highlight-ranges": JSON.stringify(node.attrs.highlightRanges ?? []),
        },
        ["code", 0],
      ],
      parseDOM: [
        {
          tag: "pre",
          preserveWhitespace: "full",
          getAttrs: (node) =>
            node instanceof HTMLElement
              ? {
                  language: node.dataset.language || DEFAULT_CODE_LANGUAGE,
                  highlightRanges: normalizeHighlightRanges(
                    parseHighlightRangesAttr(node.dataset.highlightRanges),
                    node.textContent?.split("\n").length ?? 1,
                  ),
                }
              : false,
        },
      ],
    },
    horizontalRule: {
      group: "block",
      atom: true,
      toDOM: () => ["hr"],
      parseDOM: [{ tag: "hr" }],
    },
    figure: {
      group: "block",
      content: "image figcaption?",
      isolating: true,
      defining: true,
      toDOM: () => ["figure", 0],
      parseDOM: [{ tag: "figure" }],
    },
    image: {
      attrs: {
        src: { default: "" },
        alt: { default: "" },
        width: { default: null },
        height: { default: null },
      },
      atom: true,
      draggable: false,
      selectable: false,
      toDOM: (node) => [
        "img",
        {
          src: node.attrs.src,
          alt: node.attrs.alt,
          width: node.attrs.width,
          height: node.attrs.height,
          loading: "lazy",
        },
      ],
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (node) =>
            node instanceof HTMLImageElement
              ? {
                  src: node.getAttribute("src") ?? "",
                  alt: node.getAttribute("alt") ?? "",
                  width: node.width || null,
                  height: node.height || null,
                }
              : false,
        },
      ],
    },
    figcaption: {
      content: "inline*",
      marks: "bold italic strike code link",
      toDOM: () => ["figcaption", 0],
      parseDOM: [{ tag: "figcaption" }],
    },
    hardBreak: {
      inline: true,
      group: "inline",
      selectable: false,
      toDOM: () => ["br"],
      parseDOM: [{ tag: "br" }],
    },
    text: { group: "inline" },
  },
  marks: {
    bold: {
      toDOM: () => ["strong", 0],
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
    },
    italic: {
      toDOM: () => ["em", 0],
      parseDOM: [{ tag: "em" }, { tag: "i" }],
    },
    strike: {
      toDOM: () => ["s", 0],
      parseDOM: [{ tag: "s" }, { tag: "del" }],
    },
    code: {
      toDOM: () => ["code", 0],
      parseDOM: [{ tag: "code" }],
    },
    link: {
      attrs: { href: { default: "" } },
      inclusive: false,
      toDOM: (mark) => ["a", { href: mark.attrs.href }, 0],
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (node) =>
            node instanceof HTMLAnchorElement ? { href: node.getAttribute("href") ?? "" } : false,
        },
      ],
    },
  },
});

const parseHighlightRangesAttr = (value: string | undefined) => {
  if (!value) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
};

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

export const docToJSON = (doc: ProseMirrorNode): JSONContent => doc.toJSON() as JSONContent;

export const extractTitle = (content: JSONContent | null | undefined) => {
  const nodes = content?.content ?? [];
  const title = nodes.find((node) => node.type === "title");
  return (
    title?.content?.map((node) => (node.type === "text" ? (node.text ?? "") : "")).join("") ?? ""
  );
};
