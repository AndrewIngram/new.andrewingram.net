import { describe, expect, it } from "vitest";
import { extractPostOutline, preparePostOutlineContent } from "./post-outline";

describe("post outline", () => {
  it("extracts prepared heading items from body headings", () => {
    const content = preparePostOutlineContent({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [
            { type: "text", text: "Intro" },
            { type: "text", text: " again" },
          ],
        },
        { type: "heading", attrs: { level: 6 }, content: [{ type: "text", text: "Deep" }] },
        { type: "heading", attrs: { level: 2 } },
      ],
    });

    expect(extractPostOutline(content)).toEqual([
      { id: "intro", text: "Intro", level: 2 },
      { id: "intro-again", text: "Intro again", level: 3 },
      { id: "deep", text: "Deep", level: 6 },
    ]);
  });

  it("suffixes duplicate heading ids", () => {
    const content = preparePostOutlineContent({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
      ],
    });

    expect(extractPostOutline(content).map((item) => item.id)).toEqual([
      "intro",
      "intro-2",
    ]);
  });
});
