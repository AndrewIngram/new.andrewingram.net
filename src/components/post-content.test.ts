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

  it("renders prepared highlighted code HTML", () => {
    const html = renderToStaticMarkup(
      createElement(PostContent, {
        content: {
          type: "doc",
          content: [
            { type: "title", content: [{ type: "text", text: "Post" }] },
            {
              type: "codeBlock",
              attrs: {
                language: "typescript",
                highlightedHtml:
                  '<pre class="post-code-block"><code><span class="line is-highlighted" data-line="1">const x = 1;</span></code></pre>',
              },
              content: [{ type: "text", text: "const x = 1;" }],
            },
          ],
        },
      }),
    );

    expect(html).toContain('class="post-code-block-frame"');
    expect(html).toContain('class="post-code-block"');
    expect(html).toContain('data-line="1"');
    expect(html).toContain("is-highlighted");
  });
});
