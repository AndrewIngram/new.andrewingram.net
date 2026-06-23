import {
  baseKeymap,
  chainCommands,
  deleteSelection,
  exitCode,
  joinBackward,
  selectNodeBackward,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { liftListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { NodeSelection, type Command, type EditorState, type Transaction } from "prosemirror-state";
import type { MarkType, NodeType } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { postSchema } from "./schema";

type ChainStep = (view: EditorView) => boolean;

const runCommand = (view: EditorView, command: Command) => command(view.state, view.dispatch, view);

const canRunCommand = (view: EditorView, command: Command) => command(view.state, undefined, view);

const isNodeActive = (state: EditorState, type: NodeType, attrs?: Record<string, unknown>) => {
  const { empty, from, to, $from } = state.selection;
  const attrsMatch = (nodeAttrs: Record<string, unknown>) =>
    attrs ? Object.entries(attrs).every(([key, value]) => nodeAttrs[key] === value) : true;
  const positionHasNode = (pos: number) => {
    const $pos = state.doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type === type && attrsMatch(node.attrs)) return true;
    }
    return false;
  };

  if (empty) {
    return $from.parent.type === type ? attrsMatch($from.parent.attrs) : positionHasNode(from);
  }

  let checked = false;
  let active = true;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    checked = true;
    const nodeActive =
      node.type === type && attrsMatch(node.attrs) ? true : positionHasNode(pos + 1);
    if (!nodeActive) {
      active = false;
      return false;
    }
    return true;
  });
  return checked && active;
};

const isMarkActive = (state: EditorState, type: MarkType) => {
  const { empty, from, to, $from } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));

  let checked = false;
  let active = true;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;

    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (start >= end) return true;

    checked = true;
    if (!type.isInSet(node.marks)) {
      active = false;
      return false;
    }
    return true;
  });
  return checked && active;
};

const toggleBlock =
  (type: NodeType, attrs?: Record<string, unknown>): Command =>
  (state, dispatch, view) => {
    const command = isNodeActive(state, type, attrs)
      ? setBlockType(postSchema.nodes.paragraph)
      : setBlockType(type, attrs);
    return command(state, dispatch, view);
  };

const toggleWrap =
  (type: NodeType): Command =>
  (state, dispatch, view) => {
    const command = isNodeActive(state, type)
      ? liftListItem(postSchema.nodes.listItem)
      : wrapIn(type);
    return command(state, dispatch, view);
  };

const toggleList =
  (type: NodeType): Command =>
  (state, dispatch, view) => {
    const command = isNodeActive(state, type)
      ? liftListItem(postSchema.nodes.listItem)
      : wrapInList(type);
    return command(state, dispatch, view);
  };

const applyDeleteRange =
  (from: number, to: number): ChainStep =>
  (view) => {
    view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
    return true;
  };

const insertFigureCommand =
  (attrs: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    caption?: string;
  }): Command =>
  (state, dispatch) => {
    const image = postSchema.nodes.image.create({
      src: attrs.src,
      alt: attrs.alt,
      width: attrs.width,
      height: attrs.height,
    });
    const caption = attrs.caption?.trim()
      ? postSchema.nodes.figcaption.create(null, postSchema.text(attrs.caption.trim()))
      : postSchema.nodes.figcaption.create();
    const figure = postSchema.nodes.figure.create(null, [image, caption]);

    if (!state.selection.$from.parent.type.spec.group?.includes("block")) {
      if (state.selection.$from.parent.type !== postSchema.nodes.title) return false;
    }
    if (!dispatch) return true;

    if (state.selection.$from.parent.type === postSchema.nodes.title) {
      dispatch(state.tr.insert(state.doc.child(0).nodeSize, figure).scrollIntoView());
      return true;
    }

    dispatch(state.tr.replaceSelectionWith(figure).scrollIntoView());
    return true;
  };

export const replaceFigureImageCommand =
  (attrs: {
    figurePos: number;
    src: string;
    alt: string;
    width?: number;
    height?: number;
  }): Command =>
  (state, dispatch) => {
    if (attrs.figurePos < 0 || attrs.figurePos >= state.doc.content.size) return false;

    const figure = state.doc.nodeAt(attrs.figurePos);
    if (figure?.type !== postSchema.nodes.figure) return false;

    const image = figure.firstChild;
    if (image?.type !== postSchema.nodes.image) return false;
    if (!dispatch) return true;

    const transaction = state.tr.setNodeMarkup(attrs.figurePos + 1, undefined, {
      src: attrs.src,
      alt: attrs.alt,
      width: attrs.width ?? null,
      height: attrs.height ?? null,
    });
    transaction.setSelection(NodeSelection.create(transaction.doc, attrs.figurePos));
    dispatch(transaction.scrollIntoView());
    return true;
  };

const setLinkCommand =
  (href: string): Command =>
  (state, dispatch) => {
    const { from, to, empty } = state.selection;
    const link = postSchema.marks.link;
    if (empty) return false;
    if (!dispatch) return true;

    const tr = state.tr.removeMark(from, to, link);
    const value = href.trim();
    if (value) tr.addMark(from, to, link.create({ href: value }));
    dispatch(tr.scrollIntoView());
    return true;
  };

class EditorChain {
  constructor(
    private readonly view: EditorView,
    private readonly steps: readonly ChainStep[] = [],
  ) {}

  #append(step: ChainStep) {
    return new EditorChain(this.view, [...this.steps, step]);
  }

  focus() {
    return this.#append((view) => {
      view.focus();
      return true;
    });
  }

  deleteRange(range: { from: number; to: number }) {
    return this.#append(applyDeleteRange(range.from, range.to));
  }

  toggleBold() {
    return this.#append((view) => runCommand(view, toggleMark(postSchema.marks.bold)));
  }

  toggleItalic() {
    return this.#append((view) => runCommand(view, toggleMark(postSchema.marks.italic)));
  }

  toggleStrike() {
    return this.#append((view) => runCommand(view, toggleMark(postSchema.marks.strike)));
  }

  toggleCode() {
    return this.#append((view) => runCommand(view, toggleMark(postSchema.marks.code)));
  }

  toggleHeading(attrs: { level: number }) {
    return this.#append((view) => runCommand(view, toggleBlock(postSchema.nodes.heading, attrs)));
  }

  toggleCodeBlock() {
    return this.#append((view) => runCommand(view, toggleBlock(postSchema.nodes.codeBlock)));
  }

  toggleBulletList() {
    return this.#append((view) => runCommand(view, toggleList(postSchema.nodes.bulletList)));
  }

  toggleOrderedList() {
    return this.#append((view) => runCommand(view, toggleList(postSchema.nodes.orderedList)));
  }

  toggleBlockquote() {
    return this.#append((view) => runCommand(view, toggleWrap(postSchema.nodes.blockquote)));
  }

  insertFigure(attrs: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    caption?: string;
  }) {
    return this.#append((view) => runCommand(view, insertFigureCommand(attrs)));
  }

  replaceFigureImage(attrs: {
    figurePos: number;
    src: string;
    alt: string;
    width?: number;
    height?: number;
  }) {
    return this.#append((view) => runCommand(view, replaceFigureImageCommand(attrs)));
  }

  setLink(href: string) {
    return this.#append((view) => runCommand(view, setLinkCommand(href)));
  }

  run() {
    return this.steps.every((step) => step(this.view));
  }
}

class EditorCan {
  constructor(private readonly view: EditorView) {}

  toggleBold() {
    return canRunCommand(this.view, toggleMark(postSchema.marks.bold));
  }

  toggleItalic() {
    return canRunCommand(this.view, toggleMark(postSchema.marks.italic));
  }

  toggleStrike() {
    return canRunCommand(this.view, toggleMark(postSchema.marks.strike));
  }

  toggleCode() {
    return canRunCommand(this.view, toggleMark(postSchema.marks.code));
  }

  toggleHeading(attrs: { level: number }) {
    return canRunCommand(this.view, toggleBlock(postSchema.nodes.heading, attrs));
  }

  toggleCodeBlock() {
    return canRunCommand(this.view, toggleBlock(postSchema.nodes.codeBlock));
  }

  toggleBulletList() {
    return canRunCommand(this.view, toggleList(postSchema.nodes.bulletList));
  }

  toggleOrderedList() {
    return canRunCommand(this.view, toggleList(postSchema.nodes.orderedList));
  }

  toggleBlockquote() {
    return canRunCommand(this.view, toggleWrap(postSchema.nodes.blockquote));
  }

  insertFigure(attrs: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    caption?: string;
  }) {
    return canRunCommand(this.view, insertFigureCommand(attrs));
  }

  replaceFigureImage(attrs: {
    figurePos: number;
    src: string;
    alt: string;
    width?: number;
    height?: number;
  }) {
    return canRunCommand(this.view, replaceFigureImageCommand(attrs));
  }

  setLink(href: string) {
    return canRunCommand(this.view, setLinkCommand(href));
  }
}

export const createEditorActions = (view: EditorView) => ({
  chain: () => new EditorChain(view),
  can: () => new EditorCan(view),
  isActive: (type: string, attrs?: Record<string, unknown>) => {
    const node = postSchema.nodes[type];
    const mark = postSchema.marks[type];
    if (node) return isNodeActive(view.state, node, attrs);
    if (mark) return isMarkActive(view.state, mark);
    return false;
  },
});

export type EditorActions = ReturnType<typeof createEditorActions>;

export const getEditorCommandState = (state: EditorState) => ({
  active: {
    bold: isMarkActive(state, postSchema.marks.bold),
    italic: isMarkActive(state, postSchema.marks.italic),
    strike: isMarkActive(state, postSchema.marks.strike),
    code: isMarkActive(state, postSchema.marks.code),
    heading2: isNodeActive(state, postSchema.nodes.heading, { level: 2 }),
    bulletList: isNodeActive(state, postSchema.nodes.bulletList),
    orderedList: isNodeActive(state, postSchema.nodes.orderedList),
    blockquote: isNodeActive(state, postSchema.nodes.blockquote),
    link: isMarkActive(state, postSchema.marks.link),
  },
  can: {
    bold: toggleMark(postSchema.marks.bold)(state),
    italic: toggleMark(postSchema.marks.italic)(state),
    strike: toggleMark(postSchema.marks.strike)(state),
    code: toggleMark(postSchema.marks.code)(state),
    heading2: toggleBlock(postSchema.nodes.heading, { level: 2 })(state),
    bulletList: toggleList(postSchema.nodes.bulletList)(state),
    orderedList: toggleList(postSchema.nodes.orderedList)(state),
    blockquote: toggleWrap(postSchema.nodes.blockquote)(state),
    link: !state.selection.empty,
  },
});

export const getActiveLinkHref = (state: EditorState) => {
  const link = postSchema.marks.link;
  const { empty, from, to, $from } = state.selection;
  const mark = empty
    ? link.isInSet(state.storedMarks ?? $from.marks())
    : (() => {
        let active: ReturnType<typeof link.isInSet> | null = null;
        let checked = false;
        let mismatch = false;
        state.doc.nodesBetween(from, to, (node) => {
          if (!node.isText) return true;
          const nodeLink = link.isInSet(node.marks);
          if (!nodeLink) {
            mismatch = true;
            return false;
          }
          checked = true;
          active ??= nodeLink;
          if (active.attrs.href !== nodeLink.attrs.href) {
            mismatch = true;
            return false;
          }
          return true;
        });
        return checked && !mismatch ? active : null;
      })();
  return mark ? String(mark.attrs.href ?? "") : "";
};

export const editorKeymap = keymap({
  ...baseKeymap,
  "Mod-b": toggleMark(postSchema.marks.bold),
  "Mod-i": toggleMark(postSchema.marks.italic),
  "Mod-Shift-x": toggleMark(postSchema.marks.strike),
  "Mod-e": toggleMark(postSchema.marks.code),
  "Mod-z": undo,
  "Mod-Shift-z": redo,
  "Mod-y": redo,
  Enter: chainCommands(
    splitListItem(postSchema.nodes.listItem),
    exitCode,
    baseKeymap.Enter as Command,
  ),
  Backspace: chainCommands(
    deleteSelection,
    joinBackward,
    selectNodeBackward,
    baseKeymap.Backspace as Command,
  ),
});

export const historyPlugin = history();

export type DispatchTransaction = (transaction: Transaction) => void;
