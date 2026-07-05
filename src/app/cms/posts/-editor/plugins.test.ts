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
import {
  HARPER_BRITISH_DICTIONARY,
  addWritingFeedbackIssueToDictionary,
  applyWritingFeedbackSuggestion,
  createWritingFeedbackDecorations,
  createWritingFeedbackIssues,
  createWritingFeedbackPlugin,
  dictionaryWordKey,
  dismissWritingFeedback,
  mapWritingFeedbackSpan,
  projectWritingFeedbackText,
  suppressWritingFeedbackIssue,
  toWritingFeedbackSuggestion,
  writingFeedbackPatternKey,
  writingFeedbackKind,
  writingFeedbackPluginKey,
} from "./writing-feedback";

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

const decorationAttrs = (decoration: unknown) =>
  (
    decoration as unknown as {
      type: { attrs: Record<string, string> };
    }
  ).type.attrs;

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

const createWritingFeedbackState = (plugins = [createWritingFeedbackPlugin()]) =>
  EditorState.create({
    schema: postSchema,
    doc: postSchema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Ignored title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Body " },
            {
              type: "text",
              text: "inline code",
              marks: [{ type: "code" }],
            },
            { type: "text", text: " text" },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Quoted" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "List item" }] },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "typescript", highlightRanges: [] },
          content: [{ type: "text", text: "const bad = true;" }],
        },
        {
          type: "figure",
          content: [
            { type: "image", attrs: { src: "/images/1", alt: "" } },
            { type: "figcaption", content: [{ type: "text", text: "Caption" }] },
          ],
        },
      ],
    }),
    plugins,
  });

const writingFeedbackDecorations = (state: EditorState) =>
  writingFeedbackPluginKey.getState(state)?.decorations.find() ?? [];

const writingFeedbackIssues = (state: EditorState) =>
  writingFeedbackPluginKey.getState(state)?.issues ?? [];

const createWritingFeedbackIssue = (
  state: EditorState,
  lint: Parameters<typeof createWritingFeedbackIssues>[1][number],
) => {
  const projection = projectWritingFeedbackText(state.doc);
  const issue = createWritingFeedbackIssues(projection, [lint])[0];
  if (!issue) throw new Error("Writing feedback issue not created");
  return issue;
};

const applyWritingFeedbackIssues = (
  state: EditorState,
  issues: ReturnType<typeof createWritingFeedbackIssues>,
  requestId = 1,
) => {
  const pending = state.apply(
    state.tr.setMeta(writingFeedbackPluginKey, { type: "start", requestId }),
  );
  return pending.apply(
    pending.tr.setMeta(writingFeedbackPluginKey, {
      type: "finish",
      requestId,
      issues,
    }),
  );
};

const openWritingFeedbackIssue = (state: EditorState, issueId: string) =>
  state.apply(
    state.tr.setMeta(writingFeedbackPluginKey, { type: "open", issueId }),
  );

describe("writing feedback text projection", () => {
  it("projects body prose and captions while excluding title, code blocks, and inline code", () => {
    const state = createWritingFeedbackState([]);
    const projection = projectWritingFeedbackText(state.doc);

    expect(projection.text).toBe("Body  text\n\nHeading\n\nQuoted\n\nList item\n\nCaption");
    expect(projection.text).not.toContain("Ignored title");
    expect(projection.text).not.toContain("inline code");
    expect(projection.text).not.toContain("const bad");
  });

  it("maps Harper spans back to ProseMirror positions", () => {
    const state = createWritingFeedbackState([]);
    const projection = projectWritingFeedbackText(state.doc);
    const caption = textRange(state, "Caption");
    const captionOffset = projection.text.indexOf("Caption");

    expect(
      mapWritingFeedbackSpan(projection, captionOffset, captionOffset + "Caption".length),
    ).toEqual(caption);
  });

  it("classifies spelling and typo lints separately from grammar feedback", () => {
    expect(writingFeedbackKind("Spelling")).toBe("spelling");
    expect(writingFeedbackKind("Typo")).toBe("spelling");
    expect(writingFeedbackKind("Grammar")).toBe("grammar");
    expect(writingFeedbackKind("Style")).toBe("grammar");
  });

  it("keeps British dictionary additions for Harper gaps", () => {
    expect(HARPER_BRITISH_DICTIONARY).toContain("customisable");
  });

  it("creates red spelling decorations and blue grammar decorations", () => {
    const state = createWritingFeedbackState([]);
    const projection = projectWritingFeedbackText(state.doc);
    const bodyOffset = projection.text.indexOf("Body");
    const headingOffset = projection.text.indexOf("Heading");
    const issues = createWritingFeedbackIssues(projection, [
      { from: bodyOffset, to: bodyOffset + 4, kind: "Spelling", message: "Spelling issue" },
      {
        from: headingOffset,
        to: headingOffset + 7,
        kind: "Grammar",
        message: "Grammar issue",
      },
    ]);
    const decorations = createWritingFeedbackDecorations(state.doc, issues).find();

    expect(decorations).toHaveLength(2);
    expect(decorationAttrs(decorations[0]!).class).toBe(
      "writing-feedback writing-feedback-spelling",
    );
    expect(decorationAttrs(decorations[0]!)["data-writing-feedback-id"]).toBe(issues[0]?.id);
    expect(decorationAttrs(decorations[0]!)["data-writing-feedback-kind"]).toBe("spelling");
    expect(decorationAttrs(decorations[0]!)["data-writing-feedback-message"]).toBe(
      "Spelling issue",
    );
    expect(decorationAttrs(decorations[0]!).style).toContain("anchor-name:");
    expect(decorationAttrs(decorations[0]!).style).toContain("--writing-feedback-anchor:");
    expect(decorationAttrs(decorations[0]!).title).toBeUndefined();
    expect(decorationAttrs(decorations[1]!).class).toBe(
      "writing-feedback writing-feedback-grammar",
    );
    expect(decorationAttrs(decorations[1]!)["data-writing-feedback-kind"]).toBe("grammar");
    expect(decorationAttrs(decorations[1]!)["data-writing-feedback-message"]).toBe(
      "Grammar issue",
    );
    expect(decorationAttrs(decorations[1]!).title).toBeUndefined();
  });

  it("marks the active decoration", () => {
    const state = createWritingFeedbackState([]);
    const issue = createWritingFeedbackIssue(state, {
      from: 0,
      to: 4,
      kind: "Spelling",
      message: "Spelling issue",
    });
    const decorations = createWritingFeedbackDecorations(state.doc, [issue], issue.id).find();

    expect(decorationAttrs(decorations[0]!).class).toBe(
      "writing-feedback writing-feedback-spelling writing-feedback-active",
    );
  });

  it("serializes Harper suggestions", () => {
    const suggestion = (kind: number, replacementText: string) => ({
      kind: () => kind,
      get_replacement_text: () => replacementText,
    });

    expect(toWritingFeedbackSuggestion(suggestion(0, "customisable"))).toEqual({
      kind: "replace",
      replacementText: "customisable",
    });
    expect(toWritingFeedbackSuggestion(suggestion(1, ""))).toEqual({
      kind: "remove",
      replacementText: "",
    });
    expect(toWritingFeedbackSuggestion(suggestion(2, ","))).toEqual({
      kind: "insertAfter",
      replacementText: ",",
    });
  });

  it("normalizes dictionary words and global suppression patterns", () => {
    expect(dictionaryWordKey(" “ProseMirror” ")).toBe("prosemirror");
    expect(
      writingFeedbackPatternKey({
        rule: "Comparative Adjective",
        kind: "Usage",
        message:
          'This is not an error, but an inflected form also exists: "completer".',
        problemText: "more complete",
        suggestions: [{ kind: "replace", replacementText: "completer" }],
      }),
    ).toBe(
      "rule:comparative_adjective|kind:Usage|message:this is not an error but an inflected form also exists {term}|example:more complete|suggestions:replace",
    );
    expect(
      writingFeedbackPatternKey({
        rule: "Comparative Adjective",
        kind: "Usage",
        message:
          'This is not an error, but an inflected form also exists: "completer".',
        problemText: "most common",
        suggestions: [{ kind: "replace", replacementText: "commonest" }],
      }),
    ).not.toBe(
      writingFeedbackPatternKey({
        rule: "Comparative Adjective",
        kind: "Usage",
        message:
          'This is not an error, but an inflected form also exists: "completer".',
        problemText: "more complete",
        suggestions: [{ kind: "replace", replacementText: "completer" }],
      }),
    );
  });

  it("filters writing feedback by suppression and dictionary preferences", () => {
    const state = createWritingFeedbackState([]);
    const projection = projectWritingFeedbackText(state.doc);

    expect(
      createWritingFeedbackIssues(
        projection,
        [
          {
            from: 0,
            to: 4,
            kind: "Spelling",
            message: "Spelling issue",
            problemText: "ProseMirror",
          },
        ],
        { globalDictionaryWords: ["ProseMirror"] },
      ),
    ).toHaveLength(0);
    expect(
      createWritingFeedbackIssues(
        projection,
        [
          {
            from: 0,
            to: 4,
            kind: "Grammar",
            message: "Grammar issue",
            contextHash: "post-hash",
          },
        ],
        { postSuppressionKeys: ["post-hash"] },
      ),
    ).toHaveLength(0);
    expect(
      createWritingFeedbackIssues(
        projection,
        [
          {
            from: 0,
            to: 4,
            kind: "Usage",
            message: "Usage issue",
            patternKey: "global-pattern",
          },
        ],
        { globalSuppressionKeys: ["global-pattern"] },
      ),
    ).toHaveLength(0);
  });
});

describe("writing feedback plugin state", () => {
  it("maps decorations through document edits while a new lint is pending", () => {
    const state = createWritingFeedbackState();
    const body = textRange(state, "Body ");
    const issues = createWritingFeedbackIssues(projectWritingFeedbackText(state.doc), [
      { from: 0, to: 4, kind: "Spelling", message: "Spelling issue" },
    ]);
    const decorated = applyWritingFeedbackIssues(state, issues);
    const edited = decorated.apply(
      decorated.tr
        .insertText("New ", 1)
        .setMeta(writingFeedbackPluginKey, { type: "start", requestId: 2 }),
    );

    const mapped = writingFeedbackDecorations(edited);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.from).toBe(body.from + 4);
    expect(mapped[0]?.to).toBe(body.from + 8);
  });

  it("maps active writing feedback through document edits", () => {
    const state = createWritingFeedbackState();
    const issue = createWritingFeedbackIssue(state, {
      from: 0,
      to: 4,
      kind: "Spelling",
      message: "Spelling issue",
    });
    const decorated = openWritingFeedbackIssue(
      applyWritingFeedbackIssues(state, [issue]),
      issue.id,
    );
    const edited = decorated.apply(decorated.tr.insertText("New ", 1));

    const pluginState = writingFeedbackPluginKey.getState(edited);
    expect(pluginState?.activeId).toBe(issue.id);
    expect(writingFeedbackDecorations(edited)[0]?.from).toBe(issue.from + 4);
    expect(decorationAttrs(writingFeedbackDecorations(edited)[0]!).class).toContain(
      "writing-feedback-active",
    );
  });

  it("closes active writing feedback", () => {
    const state = createWritingFeedbackState();
    const issue = createWritingFeedbackIssue(state, {
      from: 0,
      to: 4,
      kind: "Spelling",
      message: "Spelling issue",
    });
    const opened = openWritingFeedbackIssue(applyWritingFeedbackIssues(state, [issue]), issue.id);
    const transaction = dismissWritingFeedback(opened);

    expect(transaction).not.toBe(null);
    const closed = opened.apply(transaction!);
    expect(writingFeedbackPluginKey.getState(closed)?.activeId).toBe(null);
    expect(decorationAttrs(writingFeedbackDecorations(closed)[0]!).class).not.toContain(
      "writing-feedback-active",
    );
  });

  it("applies replacement, removal, and insertion suggestions", () => {
    const cases = [
      {
        suggestion: { kind: "replace" as const, replacementText: "Copy" },
        text: "Copy",
      },
      {
        suggestion: { kind: "remove" as const, replacementText: "" },
        text: "",
      },
      {
        suggestion: { kind: "insertAfter" as const, replacementText: "," },
        text: "Body,",
      },
    ];

    for (const testCase of cases) {
      const state = createWritingFeedbackState();
      const issue = createWritingFeedbackIssue(state, {
        from: 0,
        to: 4,
        kind: "Spelling",
        message: "Spelling issue",
        suggestions: [testCase.suggestion],
      });
      const opened = openWritingFeedbackIssue(applyWritingFeedbackIssues(state, [issue]), issue.id);
      const transaction = applyWritingFeedbackSuggestion(opened, 0);

      expect(transaction).not.toBe(null);
      const applied = opened.apply(transaction!);
      expect(applied.doc.textBetween(issue.from, issue.from + testCase.text.length)).toBe(
        testCase.text,
      );
      expect(writingFeedbackPluginKey.getState(applied)?.activeId).toBe(null);
      expect(writingFeedbackIssues(applied)).toHaveLength(0);
      expect(writingFeedbackDecorations(applied)).toHaveLength(0);
    }
  });

  it("suppresses active writing feedback in post and global scopes", () => {
    const cases = [
      { scope: "post" as const, stateKey: "postSuppressionKeys", value: "post-hash" },
      { scope: "global" as const, stateKey: "globalSuppressionKeys", value: "pattern-key" },
    ] satisfies ReadonlyArray<{
      scope: "post" | "global";
      stateKey: "postSuppressionKeys" | "globalSuppressionKeys";
      value: string;
    }>;

    for (const testCase of cases) {
      const state = createWritingFeedbackState();
      const issue = createWritingFeedbackIssue(state, {
        from: 0,
        to: 4,
        kind: "Grammar",
        message: "Grammar issue",
        problemText: "Body",
        contextHash: "post-hash",
        patternKey: "pattern-key",
      });
      const opened = openWritingFeedbackIssue(applyWritingFeedbackIssues(state, [issue]), issue.id);
      const transaction = suppressWritingFeedbackIssue(opened, testCase.scope);

      expect(transaction).not.toBe(null);
      const suppressed = opened.apply(transaction!);
      const pluginState = writingFeedbackPluginKey.getState(suppressed);
      expect(pluginState?.[testCase.stateKey]).toContain(testCase.value);
      expect(pluginState?.activeId).toBe(null);
      expect(writingFeedbackIssues(suppressed)).toHaveLength(0);
      expect(writingFeedbackDecorations(suppressed)).toHaveLength(0);
    }
  });

  it("adds active spelling feedback to dictionaries and hides matching issues", () => {
    const cases = [
      { scope: "post" as const, stateKey: "postDictionaryWords" },
      { scope: "global" as const, stateKey: "globalDictionaryWords" },
    ] satisfies ReadonlyArray<{
      scope: "post" | "global";
      stateKey: "postDictionaryWords" | "globalDictionaryWords";
    }>;

    for (const testCase of cases) {
      const state = createWritingFeedbackState();
      const spelling = createWritingFeedbackIssue(state, {
        from: 0,
        to: 4,
        kind: "Spelling",
        message: "Spelling issue",
        problemText: "ProseMirror",
      });
      const grammar = createWritingFeedbackIssue(state, {
        from: 7,
        to: 11,
        kind: "Grammar",
        message: "Grammar issue",
        problemText: "text",
      });
      const opened = openWritingFeedbackIssue(
        applyWritingFeedbackIssues(state, [spelling, grammar]),
        spelling.id,
      );
      const transaction = addWritingFeedbackIssueToDictionary(opened, testCase.scope);

      expect(transaction).not.toBe(null);
      const updated = opened.apply(transaction!);
      const pluginState = writingFeedbackPluginKey.getState(updated);
      expect(pluginState?.[testCase.stateKey]).toContain("ProseMirror");
      expect(pluginState?.activeId).toBe(null);
      expect(writingFeedbackIssues(updated)).toHaveLength(1);
      expect(writingFeedbackIssues(updated)[0]?.id).toBe(grammar.id);
    }
  });

  it("ignores stale lint responses", () => {
    const state = createWritingFeedbackState();
    const issues = createWritingFeedbackIssues(projectWritingFeedbackText(state.doc), [
      { from: 0, to: 4, kind: "Spelling", message: "Spelling issue" },
    ]);
    const pending = state.apply(
      state.tr.setMeta(writingFeedbackPluginKey, { type: "start", requestId: 2 }),
    );
    const stale = pending.apply(
      pending.tr.setMeta(writingFeedbackPluginKey, {
        type: "finish",
        requestId: 1,
        issues,
      }),
    );
    const current = stale.apply(
      stale.tr.setMeta(writingFeedbackPluginKey, {
        type: "finish",
        requestId: 2,
        issues,
      }),
    );

    expect(writingFeedbackDecorations(stale)).toHaveLength(0);
    expect(writingFeedbackDecorations(current)).toHaveLength(1);
    expect(writingFeedbackIssues(current)).toHaveLength(1);
  });

  it("ignores results for an older document during the debounce window", () => {
    const state = createWritingFeedbackState();
    const issues = createWritingFeedbackIssues(projectWritingFeedbackText(state.doc), [
      { from: 0, to: 4, kind: "Spelling", message: "Spelling issue" },
    ]);
    const pending = state.apply(
      state.tr.setMeta(writingFeedbackPluginKey, { type: "start", requestId: 1 }),
    );
    const edited = pending.apply(pending.tr.insertText("New ", 1));
    const stale = edited.apply(
      edited.tr.setMeta(writingFeedbackPluginKey, {
        type: "finish",
        requestId: 1,
        doc: state.doc,
        issues,
      }),
    );

    expect(writingFeedbackDecorations(stale)).toHaveLength(0);
  });

  it("clears decorations after a current request failure", () => {
    const state = createWritingFeedbackState();
    const issues = createWritingFeedbackIssues(projectWritingFeedbackText(state.doc), [
      { from: 0, to: 4, kind: "Spelling", message: "Spelling issue" },
    ]);
    const decorated = applyWritingFeedbackIssues(state, issues);
    const failed = decorated.apply(
      decorated.tr.setMeta(writingFeedbackPluginKey, { type: "start", requestId: 2 }),
    );
    const cleared = failed.apply(
      failed.tr.setMeta(writingFeedbackPluginKey, { type: "clear", requestId: 2 }),
    );

    expect(writingFeedbackDecorations(cleared)).toHaveLength(0);
    expect(writingFeedbackIssues(cleared)).toHaveLength(0);
  });
});
