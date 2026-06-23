import { describe, expect, it } from "vitest";
import {
  addHighlightedRange,
  getCodeBlockAttrs,
  migrateCodeBlockLanguageHints,
  normalizeHighlightRanges,
  toggleHighlightedLine,
} from "./code-blocks";

describe("code block metadata", () => {
  it("normalizes, clamps, sorts, and merges highlighted ranges", () => {
    expect(
      normalizeHighlightRanges(
        [
          { from: 8, to: 10 },
          { from: 2, to: 4 },
          { from: 4, to: 6 },
          { from: 20, to: 18 },
        ],
        12,
      ),
    ).toEqual([
      { from: 2, to: 6 },
      { from: 8, to: 10 },
      { from: 12, to: 12 },
    ]);
  });

  it("toggles individual highlighted lines", () => {
    const ranges = addHighlightedRange([], 2, 4, 8);

    expect(toggleHighlightedLine(ranges, 3, 8)).toEqual([
      { from: 2, to: 2 },
      { from: 4, to: 4 },
    ]);
    expect(toggleHighlightedLine(ranges, 7, 8)).toEqual([
      { from: 2, to: 4 },
      { from: 7, to: 7 },
    ]);
  });

  it("migrates language hint paragraphs into following code blocks", () => {
    expect(
      migrateCodeBlockLanguageHints({
        type: "doc",
        content: [
          { type: "title" },
          { type: "paragraph", content: [{ type: "text", text: "graphql" }] },
          { type: "codeBlock", content: [{ type: "text", text: "type Query {\n}" }] },
        ],
      }),
    ).toEqual({
      type: "doc",
      content: [
        { type: "title" },
        {
          type: "codeBlock",
          attrs: { language: "graphql", highlightRanges: [] },
          content: [{ type: "text", text: "type Query {\n}" }],
        },
      ],
    });
  });

  it("rejects unsupported code block languages at render preparation boundaries", () => {
    expect(() =>
      getCodeBlockAttrs({
        type: "codeBlock",
        attrs: { language: "unknown" },
        content: [{ type: "text", text: "x" }],
      }),
    ).toThrow("Unsupported code language");
  });
});
