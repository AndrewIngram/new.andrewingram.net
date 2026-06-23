import { describe, expect, it } from "vitest";
import { preparePostContentForRender } from "./code-highlighting";

describe("code highlighting", () => {
  it("attaches Shiki HTML with line numbers and highlighted rows", async () => {
    const content = await preparePostContentForRender({
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

    const codeBlock = content.content?.[1];
    const html = codeBlock?.attrs?.highlightedHtml;

    expect(typeof html).toBe("string");
    expect(html).toContain('class="shiki andrewingram-light post-code-block"');
    expect(html).toContain('data-language="TypeScript"');
    expect(html).toContain('<span class="line" data-line="1"');
    expect(html).toContain('<span class="line is-highlighted" data-line="2"');
    expect(html).not.toContain('class="line" data-line="2" class="is-highlighted"');
  });

  it("fails unsupported languages", async () => {
    await expect(
      preparePostContentForRender({
        type: "codeBlock",
        attrs: { language: "unsupported" },
        content: [{ type: "text", text: "x" }],
      }),
    ).rejects.toThrow("Unsupported code language");
  });
});
