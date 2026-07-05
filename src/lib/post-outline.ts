import slugify from "slugify";
import type { JSONContent, JSONValue } from "./post-content-json";

export type PostOutlineItem = {
  id: string;
  text: string;
  level: number;
};

const headingLevel = (node: JSONContent) => {
  const level = Number(node.attrs?.level);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
};

const textFromNode = (node: JSONContent): string => {
  if (node.type === "text") return node.text ?? "";
  return node.content?.map(textFromNode).join("") ?? "";
};

const nextHeadingId = (text: string, ids: Map<string, number>) => {
  const base = slugify(text, { lower: true, strict: true, trim: true }) || "section";
  const count = ids.get(base) ?? 0;
  ids.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
};

const addHeadingIds = (node: JSONContent, ids: Map<string, number>): JSONContent => {
  const content = node.content?.map((child) => addHeadingIds(child, ids));

  if (node.type !== "heading") {
    return content ? { ...node, content } : node;
  }

  const text = textFromNode(node).trim();
  if (!text) return content ? { ...node, content } : node;

  return {
    ...node,
    attrs: {
      ...node.attrs,
      id: nextHeadingId(text, ids) as JSONValue,
    },
    ...(content ? { content } : {}),
  };
};

export const preparePostOutlineContent = (content: JSONContent): JSONContent =>
  addHeadingIds(content, new Map());

export const extractPostOutline = (content: JSONContent): PostOutlineItem[] => {
  const items: PostOutlineItem[] = [];

  const visit = (node: JSONContent) => {
    if (node.type === "heading") {
      const id = typeof node.attrs?.id === "string" ? node.attrs.id : "";
      const text = textFromNode(node).trim();
      if (id && text) {
        items.push({ id, text, level: headingLevel(node) });
      }
    }
    node.content?.forEach(visit);
  };

  visit(content);
  return items;
};
