"use client";

import {
  CodeMirror,
  CodeMirrorEditor,
  react as codeMirrorReact,
} from "@handlewithcare/react-codemirror";
import {
  useEditorEffect,
  useIsNodeSelected,
  useStopEvent,
  type NodeViewComponentProps,
} from "@handlewithcare/react-prosemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import {
  EditorState as CodeMirrorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type Transaction as CodeMirrorTransaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView as CodeMirrorView,
  GutterMarker,
  gutter,
  gutterLineClass,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  lineNumberMarkers,
  type BlockInfo,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import { graphqlLanguageSupport } from "cm6-graphql";
import { Code2, Trash2 } from "lucide-react";
import { NodeSelection } from "prosemirror-state";
import type { EditorView as ProseMirrorView } from "prosemirror-view";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  addHighlightedRange,
  CODE_LANGUAGES,
  DEFAULT_CODE_LANGUAGE,
  getCodeLanguage,
  getLineCount,
  normalizeHighlightRanges,
  parseCodeLanguage,
  toggleHighlightedLine,
  type HighlightRange,
  type SupportedCodeLanguageId,
} from "@/lib/code-blocks";
import { cn } from "@/lib/utils";
import { postSchema } from "./schema";

const setHighlightRangesEffect = StateEffect.define<HighlightRange[]>();

const highlightedRangesField = StateField.define<HighlightRange[]>({
  create: () => [],
  update(ranges, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHighlightRangesEffect)) return effect.value;
    }
    return ranges;
  },
});

class HighlightedLineMarker extends GutterMarker {
  override elementClass = "cm-highlighted-line-gutter";
}

const highlightedLineMarker = new HighlightedLineMarker();

const rangesEqual = (left: readonly HighlightRange[], right: readonly HighlightRange[]) =>
  left.length === right.length &&
  left.every((range, index) => range.from === right[index]?.from && range.to === right[index]?.to);

const getHighlightedRanges = (state: CodeMirrorState) =>
  state.field(highlightedRangesField, false) ?? [];

const buildHighlightedLineMarkers = (state: CodeMirrorState) => {
  const builder = new RangeSetBuilder<GutterMarker>();
  const ranges = getHighlightedRanges(state);

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (ranges.some((range) => lineNumber >= range.from && lineNumber <= range.to)) {
      builder.add(line.from, line.from, highlightedLineMarker);
    }
  }

  return builder.finish();
};

const buildHighlightedLineDecorations = (state: CodeMirrorState) => {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = getHighlightedRanges(state);

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (ranges.some((range) => lineNumber >= range.from && lineNumber <= range.to)) {
      builder.add(line.from, line.from, Decoration.line({ class: "cm-highlighted-line" }));
    }
  }

  return builder.finish();
};

const codeBlockTheme = CodeMirrorView.theme({
  "&": {
    backgroundColor: "white",
    color: "#111827",
    fontSize: "0.875rem",
  },
  ".cm-scroller": {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace',
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "0.75rem 0",
  },
  ".cm-line": {
    padding: "0 1rem",
  },
  ".cm-gutters": {
    backgroundColor: "#f9fafb",
    borderRight: "1px solid #e5e7eb",
    color: "#6b7280",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    cursor: "pointer",
    minWidth: "2.75rem",
    padding: "0 0.75rem",
  },
  ".cm-highlighted-line": {
    backgroundColor: "#fef3c7",
  },
  ".cm-highlighted-line-gutter": {
    backgroundColor: "#fde68a",
    color: "#92400e",
  },
  ".cm-highlight-toggle": {
    width: "0.625rem",
  },
  ".cm-highlight-toggle .cm-gutterElement": {
    cursor: "pointer",
    padding: "0 0.25rem",
  },
  ".cm-focused": {
    outline: "none",
  },
});

const languageExtension = (language: SupportedCodeLanguageId): Extension => {
  switch (language) {
    case "typescript":
      return javascript({ typescript: true });
    case "javascript":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "css":
      return css();
    case "html":
      return html();
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "bash":
      return StreamLanguage.define(shell);
    case "python":
      return python();
    case "rust":
      return rust();
    case "graphql":
      return graphqlLanguageSupport();
  }
};

const toLineNumber = (view: CodeMirrorView, line: BlockInfo) =>
  view.state.doc.lineAt(line.from).number;

type CodeMirrorCodeBlockProps = {
  text: string;
  language: SupportedCodeLanguageId;
  ranges: HighlightRange[];
  onTextChange: (text: string, ranges: HighlightRange[]) => void;
  onRangesChange: (ranges: HighlightRange[]) => void;
};

function CodeMirrorCodeBlock({
  text,
  language,
  ranges,
  onTextChange,
  onRangesChange,
}: CodeMirrorCodeBlockProps) {
  const dragAnchorRef = useRef<number | null>(null);

  const extensions = useMemo(() => {
    const commitRanges = (view: CodeMirrorView, nextRanges: HighlightRange[]) => {
      const normalized = normalizeHighlightRanges(nextRanges, view.state.doc.lines);
      view.dispatch({ effects: setHighlightRangesEffect.of(normalized) });
      onRangesChange(normalized);
    };

    const selectLine = (view: CodeMirrorView, line: BlockInfo, event: Event) => {
      const mouseEvent = event as MouseEvent;
      const lineNumber = toLineNumber(view, line);
      const currentRanges = getHighlightedRanges(view.state);
      const nextRanges =
        mouseEvent.shiftKey && dragAnchorRef.current
          ? addHighlightedRange(
              currentRanges,
              dragAnchorRef.current,
              lineNumber,
              view.state.doc.lines,
            )
          : toggleHighlightedLine(currentRanges, lineNumber, view.state.doc.lines);

      dragAnchorRef.current = lineNumber;
      commitRanges(view, nextRanges);
      return true;
    };

    const dragLine = (view: CodeMirrorView, line: BlockInfo, event: Event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.buttons !== 1 || dragAnchorRef.current == null) return false;
      commitRanges(
        view,
        addHighlightedRange(
          getHighlightedRanges(view.state),
          dragAnchorRef.current,
          toLineNumber(view, line),
          view.state.doc.lines,
        ),
      );
      return true;
    };

    return [
      codeMirrorReact,
      basicSetup,
      highlightedRangesField.init(() => ranges),
      lineNumbers({
        domEventHandlers: {
          mousedown: selectLine,
          mousemove: dragLine,
          mouseup: () => {
            dragAnchorRef.current = null;
            return false;
          },
        },
      }),
      gutter({
        class: "cm-highlight-toggle",
        renderEmptyElements: true,
        lineMarker: () => highlightedLineMarker,
        domEventHandlers: {
          mousedown: selectLine,
          mousemove: dragLine,
          mouseup: () => {
            dragAnchorRef.current = null;
            return false;
          },
        },
      }),
      lineNumberMarkers.compute([highlightedRangesField], buildHighlightedLineMarkers),
      gutterLineClass.compute([highlightedRangesField], buildHighlightedLineMarkers),
      CodeMirrorView.decorations.compute(
        [highlightedRangesField],
        buildHighlightedLineDecorations,
      ),
      CodeMirrorView.domEventHandlers({
        mouseup: () => {
          dragAnchorRef.current = null;
          return false;
        },
      }),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      languageExtension(language),
      codeBlockTheme,
    ];
  }, [language, onRangesChange, ranges]);

  const [state, setState] = useState(() =>
    CodeMirrorState.create({
      doc: text,
      extensions,
    }),
  );

  useEffect(() => {
    if (
      state.doc.toString() === text &&
      getHighlightedRanges(state).length === ranges.length &&
      rangesEqual(getHighlightedRanges(state), ranges)
    ) {
      return;
    }

    setState(CodeMirrorState.create({ doc: text, extensions }));
  }, [extensions, ranges, state, text]);

  const dispatch = (transaction: CodeMirrorTransaction) => {
    const nextState = transaction.state;
    const nextRanges = normalizeHighlightRanges(
      getHighlightedRanges(nextState),
      nextState.doc.lines,
    );
    setState(nextState);
    if (transaction.docChanged) onTextChange(nextState.doc.toString(), nextRanges);
  };

  return (
    <CodeMirror state={state} dispatch={dispatch}>
      <CodeMirrorEditor className="min-h-24" />
    </CodeMirror>
  );
}

export function CodeBlockNodeView({ nodeProps, ref, className, ...props }: NodeViewComponentProps) {
  const node = nodeProps.node;
  const selected = useIsNodeSelected();
  const text = node.textContent;
  const language = parseCodeLanguage(node.attrs.language) ?? DEFAULT_CODE_LANGUAGE;
  const ranges = normalizeHighlightRanges(node.attrs.highlightRanges, getLineCount(text));
  const languageLabel = getCodeLanguage(language)?.label ?? language;
  const proseMirrorViewRef = useRef<ProseMirrorView | null>(null);

  useEditorEffect((view) => {
    proseMirrorViewRef.current = view;
    return () => {
      if (proseMirrorViewRef.current === view) proseMirrorViewRef.current = null;
    };
  }, []);

  useStopEvent(
    (_view, event) =>
      event.target instanceof Element && event.target.closest("[data-code-block]") !== null,
  );

  const updateCodeBlock = useCallback(
    (
      nextText: string,
      nextAttrs: { language: SupportedCodeLanguageId; highlightRanges: HighlightRange[] },
    ) => {
      const view = proseMirrorViewRef.current;
      if (!view) return;
      const pos = nodeProps.getPos();
      const current = view.state.doc.nodeAt(pos);
      if (current?.type !== postSchema.nodes.codeBlock) return;

      const nextRanges = normalizeHighlightRanges(
        nextAttrs.highlightRanges,
        getLineCount(nextText),
      );
      const nextNode = postSchema.nodes.codeBlock.create(
        { language: nextAttrs.language, highlightRanges: nextRanges },
        nextText ? postSchema.text(nextText) : null,
      );
      view.dispatch(view.state.tr.replaceWith(pos, pos + current.nodeSize, nextNode));
    },
    [nodeProps],
  );

  const selectCodeBlock = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".cm-editor") || target.closest("[data-code-block-control]")) return;

      const view = proseMirrorViewRef.current;
      if (!view) return;
      const pos = nodeProps.getPos();
      const current = view.state.doc.nodeAt(pos);
      if (current?.type !== postSchema.nodes.codeBlock) return;

      event.preventDefault();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      view.focus();
    },
    [nodeProps],
  );

  const deleteCodeBlock = useCallback(() => {
    const view = proseMirrorViewRef.current;
    if (!view) return;
    const pos = nodeProps.getPos();
    const current = view.state.doc.nodeAt(pos);
    if (current?.type !== postSchema.nodes.codeBlock) return;

    view.dispatch(view.state.tr.delete(pos, pos + current.nodeSize).scrollIntoView());
    view.focus();
  }, [nodeProps]);

  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        "not-prose my-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm",
        selected && "ring-2 ring-gray-900 ring-offset-2",
        className,
      )}
      contentEditable={false}
      data-code-block
      data-selected={selected}
      onMouseDown={selectCodeBlock}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2"
        data-code-block-toolbar
      >
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <Code2 className="size-4" aria-hidden="true" />
          <span>Code</span>
        </div>
        <div className="flex items-center gap-1">
          <NativeSelect
            size="sm"
            aria-label="Code language"
            value={language}
            onChange={(event) => {
              const nextLanguage =
                parseCodeLanguage(event.currentTarget.value) ?? DEFAULT_CODE_LANGUAGE;
              updateCodeBlock(text, { language: nextLanguage, highlightRanges: ranges });
            }}
            className="w-40"
            data-code-block-control
          >
            {CODE_LANGUAGES.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete code block"
            data-code-block-control
            onMouseDown={(event) => event.preventDefault()}
            onClick={deleteCodeBlock}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div aria-label={`${languageLabel} code block`}>
        <CodeMirrorCodeBlock
          key={language}
          text={text}
          language={language}
          ranges={ranges}
          onTextChange={(nextText, nextRanges) => {
            updateCodeBlock(nextText, { language, highlightRanges: nextRanges });
          }}
          onRangesChange={(nextRanges) => {
            updateCodeBlock(text, { language, highlightRanges: nextRanges });
          }}
        />
      </div>
    </div>
  );
}
