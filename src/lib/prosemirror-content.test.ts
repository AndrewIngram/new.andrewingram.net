import { describe, expect, it } from "vitest";
import type { NodeSpec } from "prosemirror-model";
import { postContent, PostContentSchema } from "./post-content-schema";
import { createProseMirrorSchemaSpec } from "./prosemirror-content";

describe("post content descriptor", () => {
  it("generates ProseMirror content expressions", () => {
    const spec = createProseMirrorSchemaSpec(postContent);
    const nodes = spec.nodes as Record<string, NodeSpec>;

    expect(nodes.doc?.content).toBe("title block+");
    expect(nodes.title?.content).toBe("text*");
    expect(nodes.title?.marks).toBe("");
    expect(nodes.figure?.content).toBe("image figcaption?");
    expect(nodes.figcaption?.marks).toBe("bold italic strike code link");
  });

  it("validates parent-aware mark rules", () => {
    const result = PostContentSchema["~standard"].validate({
      type: "doc",
      content: [
        {
          type: "title",
          content: [
            { type: "text", text: "Title", marks: [{ type: "link", attrs: { href: "/" } }] },
          ],
        },
        { type: "paragraph" },
      ],
    });

    expect(result).toHaveProperty("issues");
  });

  it("rejects children outside their parent content rule", () => {
    const result = PostContentSchema["~standard"].validate({
      type: "doc",
      content: [{ type: "title" }, { type: "image", attrs: { src: "/images/1", alt: "" } }],
    });

    expect(result).toHaveProperty("issues");
  });

  it("accepts valid media figures", () => {
    const result = PostContentSchema["~standard"].validate({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "figure",
          content: [
            { type: "image", attrs: { src: "/images/1", alt: "Cover" } },
            {
              type: "figcaption",
              content: [
                {
                  type: "text",
                  text: "Andrew",
                  marks: [{ type: "link", attrs: { href: "/about" } }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result).not.toHaveProperty("issues");
  });
});
