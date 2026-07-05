import {
  useEditorEffect,
  useEditorEventCallback,
  useEditorState,
} from "@handlewithcare/react-prosemirror";
import { type CSSProperties, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addWritingFeedbackIssueToDictionary,
  applyWritingFeedbackSuggestion,
  dismissWritingFeedback,
  getActiveWritingFeedbackIssue,
  suppressWritingFeedbackIssue,
  type WritingFeedbackSuggestion,
} from "./writing-feedback";

type WritingFeedbackPreferenceScope = "post" | "global";

type WritingFeedbackPopoverProps = {
  persistSuppression?: (
    input: {
      scope: WritingFeedbackPreferenceScope;
      key: string;
      kind: string;
      message: string;
      exampleText: string;
    },
  ) => void;
  persistDictionaryWord?: (
    input: { scope: WritingFeedbackPreferenceScope; word: string },
  ) => void;
};

const suggestionLabel = (suggestion: WritingFeedbackSuggestion) => {
  if (suggestion.kind === "remove") return "Remove";
  if (suggestion.kind === "insertAfter") return `Insert ${suggestion.replacementText}`;
  return suggestion.replacementText || "Replace";
};

export function WritingFeedbackPopover({
  persistSuppression,
  persistDictionaryWord,
}: WritingFeedbackPopoverProps) {
  const editorState = useEditorState();
  const issue = getActiveWritingFeedbackIssue(editorState);
  const [fallbackPosition, setFallbackPosition] = useState({ top: 16, left: 16 });

  useEditorEffect(
    (view) => {
      if (!issue) return;
      const start = view.coordsAtPos(issue.from);
      const end = view.coordsAtPos(issue.to);
      const viewportWidth = globalThis.window?.innerWidth ?? 1024;
      setFallbackPosition({
        top: Math.max(16, Math.min(start.top, end.top)),
        left: Math.min(viewportWidth - 16, Math.max(16, (start.left + end.right) / 2)),
      });
    },
    [issue?.id, issue?.from, issue?.to],
  );

  const applySuggestion = useEditorEventCallback((view, suggestionIndex: number) => {
    const transaction = applyWritingFeedbackSuggestion(view.state, suggestionIndex);
    if (!transaction) return;
    view.dispatch(transaction);
    view.focus();
  });

  const close = useEditorEventCallback((view) => {
    const transaction = dismissWritingFeedback(view.state);
    if (transaction) view.dispatch(transaction);
    view.focus();
  });

  const suppress = useEditorEventCallback(
    (view, scope: WritingFeedbackPreferenceScope) => {
      const issue = getActiveWritingFeedbackIssue(view.state);
      const transaction = suppressWritingFeedbackIssue(view.state, scope);
      if (!issue || !transaction) return;
      view.dispatch(transaction);
      view.focus();
      persistSuppression?.({
        scope,
        key: scope === "post" ? issue.contextHash : issue.patternKey,
        kind: issue.sourceKind,
        message: issue.message,
        exampleText: issue.problemText,
      });
    },
  );

  const addToDictionary = useEditorEventCallback(
    (view, scope: WritingFeedbackPreferenceScope) => {
      const issue = getActiveWritingFeedbackIssue(view.state);
      const transaction = addWritingFeedbackIssueToDictionary(view.state, scope);
      if (!issue || !transaction) return;
      view.dispatch(transaction);
      view.focus();
      persistDictionaryWord?.({ scope, word: issue.problemText });
    },
  );

  if (!issue) return null;

  return (
    <div
      role="dialog"
      aria-label="Writing feedback"
      className="writing-feedback-popover fixed z-50 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-lg"
      style={
        {
          "--writing-feedback-popover-anchor": issue.anchorName,
          "--writing-feedback-popover-top": `${fallbackPosition.top}px`,
          "--writing-feedback-popover-left": `${fallbackPosition.left}px`,
        } as CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase text-gray-500">
            {issue.kind === "spelling" ? "Spelling" : "Grammar"}
          </p>
          <p className="leading-snug">{issue.message}</p>
        </div>
        <button
          type="button"
          className="rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close writing feedback"
          onClick={() => close()}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {issue.suggestions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.suggestions.map((suggestion, index) => (
            <Button
              key={`${suggestion.kind}-${suggestion.replacementText}-${index}`}
              type="button"
              size="xs"
              variant="outline"
              className="max-w-full"
              onClick={() => applySuggestion(index)}
            >
              <span className="truncate">{suggestionLabel(suggestion)}</span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500">No automatic fix.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <Button type="button" size="xs" variant="ghost" onClick={() => suppress("post")}>
          Ignore in this Post
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => suppress("global")}>
          Always ignore similar
        </Button>
        {issue.kind === "spelling" ? (
          <>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => addToDictionary("post")}
            >
              Add to Post dictionary
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => addToDictionary("global")}
            >
              Add to global dictionary
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
