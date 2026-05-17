import { Fragment, type ElementType, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";

type RenderOptions = {
  skipTitle?: boolean;
};

const getChildren = (node: JSONContent, options: RenderOptions): ReactNode =>
  node.content?.map((child, index) => renderNode(child, index, options)) ?? null;

const getAttrs = (node: JSONContent) =>
  (node.attrs ?? {}) as Record<string, unknown>;

const getText = (node: JSONContent) => {
  let text = "";
  node.content?.forEach((child) => {
    if (child.type === "text") text += child.text ?? "";
    else text += getText(child);
  });
  return text;
};

const applyMarks = (node: JSONContent, content: ReactNode) =>
  (node.marks ?? []).reduce((children, mark, index) => {
    const attrs = (mark.attrs ?? {}) as Record<string, unknown>;

    switch (mark.type) {
      case "bold":
        return <strong key={index}>{children}</strong>;
      case "italic":
        return <em key={index}>{children}</em>;
      case "strike":
        return <s key={index}>{children}</s>;
      case "code":
        return <code key={index}>{children}</code>;
      case "link":
        return (
          <a key={index} href={String(attrs.href ?? "")}>
            {children}
          </a>
        );
      default:
        return children;
    }
  }, content);

const renderNode = (
  node: JSONContent,
  key: number,
  options: RenderOptions,
): ReactNode => {
  const attrs = getAttrs(node);

  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{getChildren(node, options)}</Fragment>;
    case "title":
      return options.skipTitle ? null : <h1 key={key}>{getChildren(node, options)}</h1>;
    case "paragraph":
      return <p key={key}>{getChildren(node, options)}</p>;
    case "text":
      return <Fragment key={key}>{applyMarks(node, node.text ?? "")}</Fragment>;
    case "heading": {
      const level = Number(attrs.level);
      const Tag = `h${level >= 1 && level <= 6 ? level : 2}` as ElementType;
      return <Tag key={key}>{getChildren(node, options)}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{getChildren(node, options)}</ul>;
    case "orderedList":
      return <ol key={key}>{getChildren(node, options)}</ol>;
    case "listItem":
      return <li key={key}>{getChildren(node, options)}</li>;
    case "blockquote":
      return <blockquote key={key}>{getChildren(node, options)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{getText(node)}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "imageBlock": {
      const caption = String(attrs.caption ?? "");
      return (
        <figure key={key} data-type="image-block">
          <img
            src={String(attrs.src ?? "")}
            alt={String(attrs.alt ?? "")}
            loading="lazy"
          />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    default:
      return <Fragment key={key}>{getChildren(node, options)}</Fragment>;
  }
};

export function PostContent({
  content,
  skipTitle = false,
}: {
  content: JSONContent;
  skipTitle?: boolean;
}) {
  return <>{renderNode(content, 0, { skipTitle })}</>;
}
