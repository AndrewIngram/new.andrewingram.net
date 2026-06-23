import { AllSelection, EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import {
  dismissSlashCommand,
  formattingToolbarAnchorPlugin,
  isFormattingToolbarSelection,
  scopedSelectAll,
  scopedSelectAllPlugin,
  selectionSpansTitleAndBody,
  slashCommandPlugin,
  slashCommandPluginKey,
} from "./plugins";
import { postSchema } from "./schema";

const createState = () =>
  EditorState.create({
    schema: postSchema,
    doc: postSchema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    }),
    plugins: [scopedSelectAllPlugin],
  });

const titleBoundary = (state: EditorState) => state.doc.child(0).nodeSize;

const createFigureState = () =>
  EditorState.create({
    schema: postSchema,
    doc: postSchema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        {
          type: "figure",
          content: [
            { type: "image", attrs: { src: "/images/1", alt: "" } },
            { type: "figcaption", content: [{ type: "text", text: "Caption" }] },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    }),
    plugins: [scopedSelectAllPlugin],
  });

const captionRange = (state: EditorState) => {
  let from = -1;
  let to = -1;
  state.doc.descendants((node, pos) => {
    if (node.type !== postSchema.nodes.figcaption) return true;
    from = pos + 1;
    to = pos + node.nodeSize - 1;
    return false;
  });
  if (from < 0 || to < 0) throw new Error("Caption not found");
  return { from, to };
};

const textRange = (state: EditorState, text: string) => {
  let from = -1;
  let to = -1;
  state.doc.descendants((node, pos) => {
    if (from >= 0 || !node.isText || node.text !== text) return true;
    from = pos;
    to = pos + node.nodeSize;
    return false;
  });
  if (from < 0 || to < 0) throw new Error(`Text not found: ${text}`);
  return { from, to };
};

const formattingToolbarDecorations = (state: EditorState) => {
  const decorationSet = formattingToolbarAnchorPlugin.spec.props?.decorations?.call(
    formattingToolbarAnchorPlugin,
    state,
  ) as DecorationSet | null | undefined;
  return decorationSet?.find() ?? [];
};

describe("formatting toolbar anchor", () => {
  it("anchors non-empty body and caption text selections", () => {
    const baseState = createFigureState();
    const body = textRange(baseState, "Before");
    const caption = captionRange(baseState);

    for (const range of [body, caption]) {
      const state = baseState.apply(
        baseState.tr.setSelection(TextSelection.create(baseState.doc, range.from, range.to)),
      );
      const decorations = formattingToolbarDecorations(state);

      expect(isFormattingToolbarSelection(state)).toBe(true);
      expect(decorations).toHaveLength(1);
      expect(decorations[0]?.from).toBe(range.from);
      expect(decorations[0]?.to).toBe(range.to);
      expect(
        (
          decorations[0] as unknown as {
            type: { attrs: Record<string, string> };
          }
        ).type.attrs.style,
      ).toBe("anchor-name: --formatting-toolbar");
    }
  });

  it("does not anchor title, cursor, all-document, or figure selections", () => {
    const baseState = createFigureState();
    const title = textRange(baseState, "Title");
    const body = textRange(baseState, "Before");
    const figurePos = baseState.doc.child(0).nodeSize + baseState.doc.child(1).nodeSize;
    const selections = [
      TextSelection.create(baseState.doc, title.from, title.to),
      TextSelection.create(baseState.doc, body.from),
      new AllSelection(baseState.doc),
      NodeSelection.create(baseState.doc, figurePos),
    ];

    for (const selection of selections) {
      const state = baseState.apply(baseState.tr.setSelection(selection));
      expect(isFormattingToolbarSelection(state)).toBe(false);
      expect(formattingToolbarDecorations(state)).toHaveLength(0);
    }
  });
});

describe("scoped select all", () => {
  it("blocks transactions that select both title and body", () => {
    const state = createState();
    const result = state.applyTransaction(state.tr.setSelection(new AllSelection(state.doc)));

    expect(result.transactions).toHaveLength(0);
    expect(result.state.selection.eq(state.selection)).toBe(true);
  });

  it("selects only the title when the cursor starts in the title", () => {
    const baseState = createState();
    const state = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(baseState.doc, 2)),
    );
    let selected = state;

    scopedSelectAll(state, (transaction) => {
      selected = selected.apply(transaction);
    });

    expect(selectionSpansTitleAndBody(selected, selected.selection)).toBe(false);
    expect(selected.selection.from).toBeLessThan(titleBoundary(selected));
    expect(selected.selection.to).toBeLessThanOrEqual(titleBoundary(selected));
  });

  it("selects only the body when the cursor starts in the body", () => {
    const state = createState();
    const boundary = titleBoundary(state);
    let selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, boundary + 2)),
    );

    scopedSelectAll(selected, (transaction) => {
      selected = selected.apply(transaction);
    });

    expect(selectionSpansTitleAndBody(selected, selected.selection)).toBe(false);
    expect(selected.selection.from).toBeGreaterThanOrEqual(boundary);
  });

  it("selects only caption content when the cursor starts in a caption", () => {
    const baseState = createFigureState();
    const caption = captionRange(baseState);
    let selected = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(baseState.doc, caption.from + 1)),
    );

    scopedSelectAll(selected, (transaction) => {
      selected = selected.apply(transaction);
    });

    expect(selected.selection.from).toBe(caption.from);
    expect(selected.selection.to).toBe(caption.to);
  });

  it("blocks caption-origin selections from crossing the caption boundary", () => {
    const baseState = createFigureState();
    const caption = captionRange(baseState);
    const state = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(baseState.doc, caption.from + 1)),
    );
    const result = state.applyTransaction(
      state.tr.setSelection(
        TextSelection.create(state.doc, caption.from + 1, state.doc.content.size - 1),
      ),
    );

    expect(result.transactions).toHaveLength(0);
    expect(result.state.selection.eq(state.selection)).toBe(true);
  });

  it("allows body-origin selections to include captions", () => {
    const state = createFigureState();
    const boundary = titleBoundary(state);
    const result = state.applyTransaction(
      state.tr.setSelection(
        TextSelection.create(state.doc, boundary + 1, state.doc.content.size - 1),
      ),
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.state.selection.from).toBe(boundary + 1);
    expect(result.state.selection.to).toBe(state.doc.content.size - 1);
  });
});

const createSlashState = (content: unknown[], selectionPosition: number) => {
  const doc = postSchema.nodeFromJSON({
    type: "doc",
    content,
  });

  return EditorState.create({
    schema: postSchema,
    doc,
    selection: TextSelection.create(doc, selectionPosition),
    plugins: [slashCommandPlugin],
  });
};

const typeText = (state: EditorState, text: string) => state.apply(state.tr.insertText(text));

const pasteText = typeText;

const typeSlash = (state: EditorState) => {
  let nextState = state;
  const handled = slashCommandPlugin.spec.props?.handleTextInput?.call(
    slashCommandPlugin,
    {
      state,
      dispatch(transaction: Transaction) {
        nextState = nextState.apply(transaction);
      },
    } as never,
    state.selection.from,
    state.selection.to,
    "/",
    () => state.tr.insertText("/"),
  );
  return { handled, state: nextState };
};

const slashDecorations = (state: EditorState) => {
  const decorationSet = slashCommandPlugin.spec.props?.decorations?.call(
    slashCommandPlugin,
    state,
  ) as DecorationSet | null | undefined;
  return decorationSet?.find() ?? [];
};

describe("slash command plugin", () => {
  it("does not open from existing slash text", () => {
    const state = createSlashState(
      [
        { type: "title", content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "/he" }] },
      ],
      11,
    );

    expect(slashCommandPluginKey.getState(state)?.active).toBe(null);
  });

  it("opens when slash is typed in an empty body block", () => {
    const result = typeSlash(
      createSlashState(
        [{ type: "title", content: [{ type: "text", text: "Title" }] }, { type: "paragraph" }],
        8,
      ),
    );

    expect(result.handled).toBe(true);
    expect(slashCommandPluginKey.getState(result.state)?.active).toEqual({
      from: 8,
      to: 9,
      query: "",
    });
  });

  it("does not open in the title", () => {
    const result = typeSlash(createSlashState([{ type: "title" }, { type: "paragraph" }], 1));

    expect(result.handled).toBe(false);
    expect(slashCommandPluginKey.getState(result.state)?.active).toBe(null);
  });

  it("does not open in a caption", () => {
    const result = typeSlash(
      createSlashState(
        [
          { type: "title", content: [{ type: "text", text: "Title" }] },
          {
            type: "figure",
            content: [
              { type: "image", attrs: { src: "/images/1", alt: "" } },
              { type: "figcaption" },
            ],
          },
        ],
        10,
      ),
    );

    expect(result.handled).toBe(false);
    expect(slashCommandPluginKey.getState(result.state)?.active).toBe(null);
  });

  it("does not open in a non-empty body block", () => {
    const result = typeSlash(
      createSlashState(
        [
          { type: "title", content: [{ type: "text", text: "Title" }] },
          { type: "paragraph", content: [{ type: "text", text: "Text" }] },
        ],
        12,
      ),
    );

    expect(result.handled).toBe(false);
    expect(slashCommandPluginKey.getState(result.state)?.active).toBe(null);
  });

  it("does not open when slash is pasted", () => {
    const state = pasteText(
      createSlashState(
        [{ type: "title", content: [{ type: "text", text: "Title" }] }, { type: "paragraph" }],
        8,
      ),
      "/",
    );

    expect(slashCommandPluginKey.getState(state)?.active).toBe(null);
  });

  it("tolerates single spaces in the query", () => {
    const opened = typeSlash(
      createSlashState(
        [{ type: "title", content: [{ type: "text", text: "Title" }] }, { type: "paragraph" }],
        8,
      ),
    ).state;
    const state = typeText(opened, "code block");

    expect(slashCommandPluginKey.getState(state)?.active).toEqual({
      from: 8,
      to: 19,
      query: "code block",
    });
    const decorations = slashDecorations(state);
    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(8);
    expect(decorations[0]?.to).toBe(19);
    expect(
      (
        decorations[0] as unknown as {
          type: { attrs: Record<string, string> };
        }
      ).type.attrs.style,
    ).toBe("anchor-name: --slash-command");
  });

  it("closes on double spaces while keeping text", () => {
    const opened = typeSlash(
      createSlashState(
        [{ type: "title", content: [{ type: "text", text: "Title" }] }, { type: "paragraph" }],
        8,
      ),
    ).state;
    const state = typeText(opened, "code  block");

    expect(slashCommandPluginKey.getState(state)?.active).toBe(null);
    expect(state.doc.textContent).toBe("Title/code  block");
  });

  it("closes on escape while keeping text", () => {
    const opened = typeText(
      typeSlash(
        createSlashState(
          [{ type: "title", content: [{ type: "text", text: "Title" }] }, { type: "paragraph" }],
          8,
        ),
      ).state,
      "he",
    );
    const transaction = dismissSlashCommand(opened);

    expect(transaction).not.toBe(null);
    const state = opened.apply(transaction!);
    expect(slashCommandPluginKey.getState(state)?.active).toBe(null);
    expect(state.doc.textContent).toBe("Title/he");
  });

  it("closes when selection leaves and does not reopen on return", () => {
    const opened = typeText(
      typeSlash(
        createSlashState(
          [{ type: "title", content: [{ type: "text", text: "Title" }] }, { type: "paragraph" }],
          8,
        ),
      ).state,
      "he",
    );
    const away = opened.apply(opened.tr.setSelection(TextSelection.create(opened.doc, 2)));
    const returned = away.apply(away.tr.setSelection(TextSelection.create(away.doc, 11)));

    expect(slashCommandPluginKey.getState(away)?.active).toBe(null);
    expect(slashCommandPluginKey.getState(returned)?.active).toBe(null);
  });

  it("opens again when a fresh slash is typed in an empty body block", () => {
    const opened = typeText(
      typeSlash(
        createSlashState(
          [
            { type: "title", content: [{ type: "text", text: "Title" }] },
            { type: "paragraph" },
            { type: "paragraph" },
          ],
          8,
        ),
      ).state,
      "he",
    );
    const closed = opened.apply(dismissSlashCommand(opened)!);
    const moved = closed.apply(closed.tr.setSelection(TextSelection.create(closed.doc, 13)));
    const result = typeSlash(moved);

    expect(result.handled).toBe(true);
    expect(slashCommandPluginKey.getState(result.state)?.active).toMatchObject({
      query: "",
    });
  });
});
