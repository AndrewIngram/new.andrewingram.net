import { reactKeys } from "@handlewithcare/react-prosemirror";
import { inputRules, textblockTypeInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Selection,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { editorKeymap, historyPlugin } from "./commands";
import { postSchema } from "./schema";
import { createWritingFeedbackPlugin, type WritingFeedbackPluginOptions } from "./writing-feedback";

const hasMeaningfulBody = (doc: ProseMirrorNode) => {
  let meaningful = false;
  doc.descendants((node, pos) => {
    if (pos === 0 || node.type === postSchema.nodes.title) return true;
    if (node.type === postSchema.nodes.figure) meaningful = true;
    if (node.isText && node.text?.trim()) meaningful = true;
    return !meaningful;
  });
  return meaningful;
};

const selectionTouchesTitle = (state: EditorState) => {
  const { from, to } = state.selection;
  let touchesTitle = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type === postSchema.nodes.title) touchesTitle = true;
    return !touchesTitle;
  });
  return touchesTitle;
};

export const isFormattingToolbarSelection = (state: EditorState) =>
  state.selection instanceof TextSelection &&
  !state.selection.empty &&
  !selectionTouchesTitle(state);

export const formattingToolbarAnchorPlugin = new Plugin({
  props: {
    decorations(state) {
      if (!isFormattingToolbarSelection(state)) return null;
      return DecorationSet.create(state.doc, [
        Decoration.inline(state.selection.from, state.selection.to, {
          style: "anchor-name: --formatting-toolbar",
        }),
      ]);
    },
  },
});

export const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const decorations: Decoration[] = [];
      const { doc } = state;

      if (doc.childCount > 0) {
        const title = doc.child(0);
        if (title.type === postSchema.nodes.title && title.textContent.length === 0) {
          decorations.push(
            Decoration.node(0, title.nodeSize, {
              class: "is-empty",
              "data-placeholder": "Untitled post",
            }),
          );
        }
      }

      if (!hasMeaningfulBody(doc)) {
        let bodyPos = 0;
        doc.descendants((node, pos) => {
          if (
            bodyPos === 0 &&
            pos > 0 &&
            node.type === postSchema.nodes.paragraph &&
            node.textContent.length === 0
          ) {
            bodyPos = pos;
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: "is-empty",
                "data-placeholder": "Write your story...",
              }),
            );
            return false;
          }
          return true;
        });
      }

      return DecorationSet.create(doc, decorations);
    },
  },
});

export const inputRulePlugin = inputRules({
  rules: [
    textblockTypeInputRule(/^##\s$/, postSchema.nodes.heading, { level: 2 }),
    textblockTypeInputRule(/^###\s$/, postSchema.nodes.heading, { level: 3 }),
    textblockTypeInputRule(/^```\s$/, postSchema.nodes.codeBlock),
  ],
});

export type SlashCommandRange = {
  from: number;
  to: number;
  query: string;
};

export type SlashCommandPluginState = {
  active: SlashCommandRange | null;
};

type SlashCommandMeta = {
  dismiss?: true;
  trigger?: { from: number };
};

export const slashCommandPluginKey = new PluginKey<SlashCommandPluginState>("slashCommand");

const canTriggerSlashCommand = (state: EditorState) => {
  const { selection } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  if (
    !$from.parent.isTextblock ||
    $from.parent.type === postSchema.nodes.title ||
    $from.parent.type === postSchema.nodes.figcaption
  ) {
    return false;
  }

  return $from.parentOffset === 0 && $from.parent.textContent.length === 0;
};

const findSlashCommandRangeFromTrigger = (
  state: EditorState,
  from: number,
): SlashCommandRange | null => {
  const { selection } = state;
  if (!selection.empty || selection.from <= from) return null;

  const $from = state.doc.resolve(from);
  const $to = selection.$from;
  if ($from.parent !== $to.parent) return null;
  if (
    !$from.parent.isTextblock ||
    $from.parent.type === postSchema.nodes.title ||
    $from.parent.type === postSchema.nodes.figcaption
  ) {
    return null;
  }

  if (state.doc.textBetween(from, from + 1, "\n", "\n") !== "/") return null;
  const query = state.doc.textBetween(from + 1, selection.from, "\n", "\n");
  if (/\s{2,}/.test(query)) return null;
  return {
    from,
    to: selection.from,
    query,
  };
};

export const dismissSlashCommand = (state: EditorState) => {
  const active = slashCommandPluginKey.getState(state)?.active;
  return active ? state.tr.setMeta(slashCommandPluginKey, { dismiss: true }) : null;
};

export const slashCommandPlugin = new Plugin<SlashCommandPluginState>({
  key: slashCommandPluginKey,
  state: {
    init: () => ({ active: null }),
    apply(transaction, value, _oldState, newState) {
      const meta = transaction.getMeta(slashCommandPluginKey) as SlashCommandMeta | undefined;
      if (meta?.dismiss) return { active: null };

      const triggerFrom = meta?.trigger?.from;
      if (typeof triggerFrom === "number") {
        return {
          active: findSlashCommandRangeFromTrigger(newState, triggerFrom),
        };
      }

      if (!value.active) return value;
      const mapped = transaction.mapping.mapResult(value.active.from, 1);
      if (mapped.deleted) return { active: null };
      return {
        active: findSlashCommandRangeFromTrigger(newState, mapped.pos),
      };
    },
  },
  props: {
    handleTextInput(view, from, to, text) {
      if (text !== "/" || !canTriggerSlashCommand(view.state)) return false;
      const transaction = view.state.tr
        .insertText(text, from, to)
        .setMeta(slashCommandPluginKey, { trigger: { from } });
      view.dispatch(transaction);
      return true;
    },
    decorations(state) {
      const active = slashCommandPluginKey.getState(state)?.active;
      if (!active) return null;
      return DecorationSet.create(state.doc, [
        Decoration.inline(active.from, active.to, {
          class: "slash-command-query",
          style: "anchor-name: --slash-command",
        }),
      ]);
    },
  },
});

const titleBoundary = (state: EditorState) =>
  state.doc.childCount > 0 ? state.doc.child(0).nodeSize : 0;

export const selectionSpansTitleAndBody = (state: EditorState, selection: Selection) => {
  const boundary = titleBoundary(state);
  return selection.from < boundary && selection.to > boundary;
};

export const scopedSelectAll = (state: EditorState, dispatch?: (tr: Transaction) => void) => {
  if (state.selection.$from.parent.type === postSchema.nodes.figcaption) {
    const selection = TextSelection.create(
      state.doc,
      state.selection.$from.start(),
      state.selection.$from.end(),
    );
    if (dispatch) dispatch(state.tr.setSelection(selection));
    return true;
  }

  const boundary = titleBoundary(state);
  if (boundary === 0) return false;

  const selection =
    state.selection.$from.parent.type === postSchema.nodes.title
      ? TextSelection.between(state.doc.resolve(0), state.doc.resolve(boundary))
      : TextSelection.between(
          state.doc.resolve(boundary),
          state.doc.resolve(state.doc.content.size),
        );

  if (!dispatch) return true;
  dispatch(state.tr.setSelection(selection));
  return true;
};

export const scopedSelectAllPlugin = new Plugin({
  filterTransaction(transaction, state) {
    if (!transaction.selectionSet) return true;
    if (selectionSpansTitleAndBody(state, transaction.selection)) return false;

    const { selection } = transaction;
    if (selection.$anchor.parent.type !== postSchema.nodes.figcaption) return true;
    const captionFrom = selection.$anchor.start();
    const captionTo = selection.$anchor.end();
    return selection.head >= captionFrom && selection.head <= captionTo;
  },
});

export const scopedSelectAllKeymap = keymap({
  "Mod-a": scopedSelectAll,
});

export type EditorPluginsOptions = {
  writingFeedback?: WritingFeedbackPluginOptions;
};

export const createEditorPlugins = ({ writingFeedback }: EditorPluginsOptions = {}) => [
  inputRulePlugin,
  scopedSelectAllPlugin,
  slashCommandPlugin,
  formattingToolbarAnchorPlugin,
  createWritingFeedbackPlugin(writingFeedback),
  historyPlugin,
  placeholderPlugin,
  reactKeys(),
];

export const editorPlugins = createEditorPlugins();

export const externalPlugins = [scopedSelectAllKeymap, editorKeymap];
