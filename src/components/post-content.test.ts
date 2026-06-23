import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PostContent } from "./post-content";

describe("PostContent", () => {
  it("renders media figures with inline caption content", () => {
    const html = renderToStaticMarkup(
      createElement(PostContent, {
        content: {
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
                    { type: "text", text: "Photo by " },
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
        },
      }),
    );

    expect(html).toContain("<figure>");
    expect(html).toContain('src="/images/1?width=640&amp;format=auto"');
    expect(html).toContain('srcSet="/images/1?width=320&amp;format=auto 320w');
    expect(html).toContain('sizes="(max-width: 42rem) calc(100vw - 2rem), 40rem"');
    expect(html).toContain('alt="Cover"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<figcaption>Photo by <a href="/about">Andrew</a></figcaption>');
  });
});
