import { describe, expect, it } from "vitest";
import { NodeSelection, TextSelection, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  createEditorActions,
  getActiveLinkHref,
  getEditorCommandState,
  replaceFigureImageCommand,
} from "./commands";
import { postSchema } from "./schema";

const createState = (content: unknown) =>
  EditorState.create({
    schema: postSchema,
    doc: postSchema.nodeFromJSON(content),
  });

const textRange = (state: EditorState, text: string): { from: number; to: number } => {
  let range: { from: number; to: number } | undefined;
  state.doc.descendants((node, pos) => {
    if (range || !node.isText || node.text !== text) return true;
    range = { from: pos, to: pos + node.nodeSize };
    return false;
  });
  if (!range) throw new Error(`Text not found: ${text}`);
  return range;
};

describe("editor commands", () => {
  it("clones command chains instead of mutating existing chains", () => {
    let focused = 0;
    const view = {
      focus: () => {
        focused += 1;
      },
    } as EditorView;

    const chain = createEditorActions(view).chain();
    const focusedChain = chain.focus();

    chain.run();
    expect(focused).toBe(0);

    focusedChain.run();
    expect(focused).toBe(1);
  });

  it("reports marks active only when the entire text selection has the mark", () => {
    const state = createState({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bold",
              marks: [{ type: "bold" }, { type: "link", attrs: { href: "/a" } }],
            },
            { type: "text", text: " plain" },
          ],
        },
      ],
    });
    const boldRange = textRange(state, "bold");
    const plainRange = textRange(state, " plain");
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, boldRange.from, plainRange.to)),
    );

    expect(getEditorCommandState(selected).active.bold).toBe(false);
    expect(getEditorCommandState(selected).active.link).toBe(false);
    expect(getActiveLinkHref(selected)).toBe("");
  });

  it("reports marks active when the entire text selection has the same mark", () => {
    const state = createState({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "linked",
              marks: [{ type: "bold" }, { type: "link", attrs: { href: "/a" } }],
            },
          ],
        },
      ],
    });
    const range = textRange(state, "linked");
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)),
    );

    expect(getEditorCommandState(selected).active.bold).toBe(true);
    expect(getEditorCommandState(selected).active.link).toBe(true);
    expect(getActiveLinkHref(selected)).toBe("/a");
  });

  it("replaces figure image attributes while preserving its caption", () => {
    const state = createState({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        {
          type: "figure",
          content: [
            {
              type: "image",
              attrs: { src: "/images/old", alt: "Old", width: 100, height: 50 },
            },
            { type: "figcaption", content: [{ type: "text", text: "Authored caption" }] },
          ],
        },
      ],
    });
    const figurePos = state.doc.child(0).nodeSize;
    let nextState = state;

    const replaced = replaceFigureImageCommand({
      figurePos,
      src: "/images/new",
      alt: "New",
      width: 640,
      height: 480,
    })(state, (transaction) => {
      nextState = state.apply(transaction);
    });

    expect(replaced).toBe(true);
    expect(nextState.doc.nodeAt(figurePos)?.toJSON()).toEqual({
      type: "figure",
      content: [
        {
          type: "image",
          attrs: { src: "/images/new", alt: "New", width: 640, height: 480 },
        },
        { type: "figcaption", content: [{ type: "text", text: "Authored caption" }] },
      ],
    });
    expect(nextState.selection).toBeInstanceOf(NodeSelection);
    expect(nextState.selection.from).toBe(figurePos);
  });

  it("does not replace a stale or invalid figure position", () => {
    const state = createState({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Post" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    });

    expect(
      replaceFigureImageCommand({
        figurePos: state.doc.child(0).nodeSize,
        src: "/images/new",
        alt: "New",
      })(state),
    ).toBe(false);
    expect(
      replaceFigureImageCommand({
        figurePos: state.doc.content.size + 1,
        src: "/images/new",
        alt: "New",
      })(state),
    ).toBe(false);
  });
});
