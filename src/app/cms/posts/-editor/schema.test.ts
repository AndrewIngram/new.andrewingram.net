import { describe, expect, it } from "vitest";
import { docToJSON, extractTitle, normalizePostDoc } from "./schema";
import type { JSONContent } from "@/lib/post-content-json";

describe("post editor schema", () => {
  it("keeps title first and preserves supported body blocks", () => {
    const doc = normalizePostDoc(
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }],
      },
      "Fallback",
    );

    expect(docToJSON(doc)).toEqual({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Fallback" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    });
  });

  it("serializes figures with inline captions", () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "figure",
          content: [
            {
              type: "image",
              attrs: { src: "/images/1", alt: "Cover", width: null, height: null },
            },
            {
              type: "figcaption",
              content: [{ type: "text", text: "Caption" }],
            },
          ],
        },
      ],
    };

    const doc = normalizePostDoc(content, "");

    expect(docToJSON(doc)).toEqual(content);
    expect(extractTitle(docToJSON(doc))).toBe("Post");
  });

  it("serializes code block metadata", () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "codeBlock",
          attrs: {
            language: "typescript",
            highlightRanges: [
              { from: 2, to: 3 },
              { from: 10, to: 12 },
            ],
          },
          content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }],
        },
      ],
    };

    expect(docToJSON(normalizePostDoc(content, ""))).toEqual({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "codeBlock",
          attrs: {
            language: "typescript",
            highlightRanges: [{ from: 2, to: 2 }],
          },
          content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }],
        },
      ],
    });
  });

  it("migrates language hint paragraphs before code blocks", () => {
    const doc = normalizePostDoc(
      {
        type: "doc",
        content: [
          { type: "title", content: [{ type: "text", text: "Post" }] },
          { type: "paragraph", content: [{ type: "text", text: "graphql" }] },
          { type: "codeBlock", content: [{ type: "text", text: "type Query {\n}" }] },
        ],
      },
      "",
    );

    expect(docToJSON(doc)).toEqual({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "codeBlock",
          attrs: { language: "graphql", highlightRanges: [] },
          content: [{ type: "text", text: "type Query {\n}" }],
        },
      ],
    });
  });
});
