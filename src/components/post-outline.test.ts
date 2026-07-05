import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PostOutline } from "./post-outline";

describe("PostOutline", () => {
  it("renders outline links when enabled", () => {
    const html = renderToStaticMarkup(
      createElement(PostOutline, {
        showOutline: true,
        items: [
          { id: "intro", text: "Intro", level: 2 },
          { id: "details", text: "Details", level: 3 },
        ],
      }),
    );

    expect(html).toContain('aria-label="Post outline"');
    expect(html).toContain('href="#intro"');
    expect(html).toContain("Intro");
    expect(html).toContain('href="#details"');
  });

  it("returns null when disabled or empty", () => {
    expect(
      renderToStaticMarkup(
        createElement(PostOutline, {
          showOutline: false,
          items: [{ id: "intro", text: "Intro", level: 2 }],
        }),
      ),
    ).toBe("");

    expect(
      renderToStaticMarkup(
        createElement(PostOutline, {
          showOutline: true,
          items: [],
        }),
      ),
    ).toBe("");
  });
});
