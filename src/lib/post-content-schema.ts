import {
  all,
  array,
  attr,
  createStandardSchema,
  custom,
  defineProseMirrorContent,
  group,
  literal,
  many,
  mark,
  node,
  none,
  nullable,
  number,
  only,
  optional,
  ref,
  seq,
  some,
  string,
  text,
} from "./prosemirror-content";
import type {
  ContentOf,
  NodeUnionOf,
  StandardSchemaV1,
} from "./prosemirror-content";
import {
  DEFAULT_CODE_LANGUAGE,
  isSupportedCodeLanguage,
  normalizeHighlightRanges,
  type HighlightRange,
  type SupportedCodeLanguageId,
} from "./code-blocks";

const parseHighlightRangesAttr = (value: string | undefined) => {
  if (!value) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
};

const codeLanguage = () =>
  custom<SupportedCodeLanguageId>((value) =>
    isSupportedCodeLanguage(value)
      ? { value }
      : {
          issues: [
            { message: `Unsupported code language: ${String(value ?? "")}` },
          ],
        },
  );

const highlightRange = () =>
  custom<HighlightRange>((value) => {
    if (!value || typeof value !== "object") {
      return { issues: [{ message: "Expected highlighted line range" }] };
    }
    const range = value as Record<string, unknown>;
    const from = Number(range.from);
    const to = Number(range.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return {
        issues: [{ message: "Expected numeric highlighted line range" }],
      };
    }
    return { value: { from, to } };
  });

type LinkAttrs = { href: string } & Record<string, unknown>;
type HeadingAttrs = { level: 2 | 3 } & Record<string, unknown>;
type OrderedListAttrs = { order: number } & Record<string, unknown>;
type CodeBlockAttrs = {
  language: SupportedCodeLanguageId;
  highlightRanges: HighlightRange[];
} & Record<string, unknown>;
type ImageAttrs = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
} & Record<string, unknown>;

export const postContent = defineProseMirrorContent({
  topNode: "doc",
  marks: {
    bold: mark({
      toDOM: () => ["strong", 0],
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
    }),
    italic: mark({
      toDOM: () => ["em", 0],
      parseDOM: [{ tag: "em" }, { tag: "i" }],
    }),
    strike: mark({
      toDOM: () => ["s", 0],
      parseDOM: [{ tag: "s" }, { tag: "del" }],
    }),
    code: mark({
      toDOM: () => ["code", 0],
      parseDOM: [{ tag: "code" }],
    }),
    link: mark({
      attrs: {
        href: attr(string(), { default: "" }),
      },
      inclusive: false,
      toDOM: ({ href }: LinkAttrs) => ["a", { href }, 0],
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (node: Node) =>
            node instanceof HTMLAnchorElement
              ? { href: node.getAttribute("href") ?? "" }
              : false,
        },
      ],
    }),
  },
  nodes: {
    doc: node({
      content: seq(ref("title"), some(group("block"))),
    }),
    title: node({
      group: "title",
      content: many(ref("text")),
      marks: none(),
      defining: true,
      toDOM: () => ["h1", { "data-node": "title" }, 0],
      parseDOM: [{ tag: "h1[data-node='title']" }, { tag: "post-title" }],
    }),
    paragraph: node({
      group: "block",
      content: many(group("inline")),
      marks: all(),
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    }),
    heading: node({
      group: "block",
      content: many(group("inline")),
      marks: all(),
      attrs: {
        level: attr(literal(2, 3), { default: 2 }),
      },
      defining: true,
      toDOM: ({ level }: HeadingAttrs) => [`h${level}`, 0],
      parseDOM: [
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
      ],
    }),
    blockquote: node({
      group: "block",
      content: some(group("block")),
      defining: true,
      toDOM: () => ["blockquote", 0],
      parseDOM: [{ tag: "blockquote" }],
    }),
    bulletList: node({
      group: "block",
      content: some(ref("listItem")),
      toDOM: () => ["ul", 0],
      parseDOM: [{ tag: "ul" }],
    }),
    orderedList: node({
      group: "block",
      content: some(ref("listItem")),
      attrs: {
        order: attr(number(), { default: 1 }),
      },
      toDOM: ({ order }: OrderedListAttrs) =>
        order === 1 ? ["ol", 0] : ["ol", { start: order }, 0],
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (node: Node) => ({
            order:
              node instanceof HTMLOListElement && node.hasAttribute("start")
                ? Number(node.getAttribute("start"))
                : 1,
          }),
        },
      ],
    }),
    listItem: node({
      content: seq(ref("paragraph"), many(group("block"))),
      defining: true,
      toDOM: () => ["li", 0],
      parseDOM: [{ tag: "li" }],
    }),
    codeBlock: node({
      group: "block",
      content: many(ref("text")),
      marks: none(),
      attrs: {
        language: attr(codeLanguage(), { default: DEFAULT_CODE_LANGUAGE }),
        highlightRanges: attr(array(highlightRange()), { default: [] }),
      },
      code: true,
      defining: true,
      isolating: true,
      selectable: true,
      toDOM: ({ language, highlightRanges }: CodeBlockAttrs) => [
        "pre",
        {
          "data-language": language,
          "data-highlight-ranges": JSON.stringify(highlightRanges ?? []),
        },
        ["code", 0],
      ],
      parseDOM: [
        {
          tag: "pre",
          preserveWhitespace: "full",
          getAttrs: (node: Node) =>
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
    }),
    horizontalRule: node({
      group: "block",
      atom: true,
      toDOM: () => ["hr"],
      parseDOM: [{ tag: "hr" }],
    }),
    figure: node({
      group: "block",
      content: seq(ref("image"), optional(ref("figcaption"))),
      isolating: true,
      defining: true,
      toDOM: () => ["figure", 0],
      parseDOM: [{ tag: "figure" }],
    }),
    image: node({
      attrs: {
        src: attr(string(), { default: "" }),
        alt: attr(string(), { default: "" }),
        width: attr(nullable(number()), { default: null }),
        height: attr(nullable(number()), { default: null }),
      },
      atom: true,
      draggable: false,
      selectable: false,
      toDOM: ({ src, alt, width, height }: ImageAttrs) => [
        "img",
        {
          src,
          alt,
          width,
          height,
          loading: "lazy",
        },
      ],
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (node: Node) =>
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
    }),
    figcaption: node({
      content: many(group("inline")),
      marks: only("bold", "italic", "strike", "code", "link"),
      toDOM: () => ["figcaption", 0],
      parseDOM: [{ tag: "figcaption" }],
    }),
    hardBreak: node({
      inline: true,
      group: "inline",
      selectable: false,
      toDOM: () => ["br"],
      parseDOM: [{ tag: "br" }],
    }),
    text: text(),
  },
});

export const PostContentSchema = createStandardSchema(postContent);

export type PostContent = ContentOf<typeof postContent>;
export type AnyPostContentNode = NodeUnionOf<typeof postContent>;
export type PostContentSchema = typeof PostContentSchema;
export type PreparedPostContent = AnyPostContentNode;
export type InferStandardSchemaOutput<Schema extends StandardSchemaV1> =
  StandardSchemaV1.InferOutput<Schema>;
