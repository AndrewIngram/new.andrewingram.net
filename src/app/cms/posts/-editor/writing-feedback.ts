import type {
  Lint as HarperLint,
  Linter,
  LintOptions,
  Suggestion as HarperSuggestion,
} from "harper.js";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { type EditorState, Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import { postSchema } from "./schema";

export const WRITING_FEEDBACK_DEBOUNCE_MS = 600;

export const HARPER_BRITISH_DICTIONARY = ["customisable"];

const lintOptions = { language: "plaintext" } satisfies LintOptions;

export type WritingFeedbackProjection = {
  text: string;
  offsetToPosition: Array<number | null>;
};

export type WritingFeedbackKind = "spelling" | "grammar";

export type WritingFeedbackSuggestion = {
  kind: "replace" | "remove" | "insertAfter";
  replacementText: string;
};

export type WritingFeedbackLint = {
  from: number;
  to: number;
  message: string;
  kind: string;
  problemText?: string;
  contextHash?: string;
  patternKey?: string;
  suggestions?: WritingFeedbackSuggestion[];
};

export type WritingFeedbackIssue = {
  id: string;
  anchorName: string;
  from: number;
  to: number;
  message: string;
  problemText: string;
  contextHash: string;
  patternKey: string;
  sourceKind: string;
  kind: WritingFeedbackKind;
  suggestions: WritingFeedbackSuggestion[];
};

export type WritingFeedbackPreferences = {
  postSuppressionKeys?: string[];
  globalSuppressionKeys?: string[];
  postDictionaryWords?: string[];
  globalDictionaryWords?: string[];
};

export type WritingFeedbackPluginState = {
  decorations: DecorationSet;
  issues: WritingFeedbackIssue[];
  activeId: string | null;
  requestId: number;
  postSuppressionKeys: string[];
  globalSuppressionKeys: string[];
  postDictionaryWords: string[];
  globalDictionaryWords: string[];
};

type WritingFeedbackMeta =
  | { type: "start"; requestId: number }
  | {
      type: "finish";
      requestId: number;
      doc?: ProseMirrorNode;
      issues: WritingFeedbackIssue[];
    }
  | { type: "clear"; requestId: number; doc?: ProseMirrorNode }
  | { type: "open"; issueId: string }
  | { type: "close" }
  | { type: "resolve"; issueId: string }
  | { type: "suppress"; issueId: string; scope: "post" | "global" }
  | { type: "addDictionaryWord"; issueId: string; scope: "post" | "global"; word: string };

type WritingFeedbackClient = Pick<
  Linter,
  "contextHash" | "dispose" | "importWords" | "organizedLints"
>;

export type WritingFeedbackPluginOptions = {
  createClient?: () => Promise<WritingFeedbackClient>;
  debounceMs?: number;
  preferences?: WritingFeedbackPreferences;
};

export const writingFeedbackPluginKey = new PluginKey<WritingFeedbackPluginState>(
  "writingFeedback",
);

const isWritingFeedbackMeta = (value: unknown): value is WritingFeedbackMeta =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  (value as { type?: unknown }).type !== undefined;

const devLog = (message: string, data: Record<string, unknown>) => {
  if (import.meta.env.DEV) console.info(`[writing-feedback] ${message}`, data);
};

const devWarn = (message: string, error: unknown) => {
  if (import.meta.env.DEV) console.warn(`[writing-feedback] ${message}`, error);
};

const createDefaultHarperClient = async (): Promise<WritingFeedbackClient> => {
  const setupStartedAt = performance.now();
  const [{ Dialect, WorkerLinter }, { binaryInlined }] = await Promise.all([
    import("harper.js"),
    import("harper.js/binaryInlined"),
  ]);
  const linter = new WorkerLinter({ binary: binaryInlined, dialect: Dialect.British });
  await linter.setup();
  await linter.setDialect(Dialect.British);
  await linter.importWords([...HARPER_BRITISH_DICTIONARY]);
  devLog("setup", {
    durationMs: Math.round(performance.now() - setupStartedAt),
    dialect: await linter.getDialect(),
  });
  return linter;
};

const appendSeparator = (parts: string[], offsetToPosition: Array<number | null>) => {
  for (const char of "\n\n") {
    parts.push(char);
    offsetToPosition.push(null);
  }
};

const appendText = (
  parts: string[],
  offsetToPosition: Array<number | null>,
  text: string,
  position: number,
) => {
  let nextPosition = position;
  const lastOffset = offsetToPosition.length - 1;
  if (offsetToPosition[lastOffset] == null) offsetToPosition[lastOffset] = nextPosition;

  for (const char of Array.from(text)) {
    parts.push(char);
    nextPosition += char.length;
    offsetToPosition.push(nextPosition);
  }
};

export const projectWritingFeedbackText = (
  doc: ProseMirrorNode,
): WritingFeedbackProjection => {
  const parts: string[] = [];
  const offsetToPosition: Array<number | null> = [null];
  let previousParent: ProseMirrorNode | null = null;

  doc.descendants((node, pos, parent) => {
    if (node.type === postSchema.nodes.title || node.type === postSchema.nodes.codeBlock) {
      return false;
    }

    if (!node.isText || !node.text || !parent) return true;
    if (node.marks.some((mark) => mark.type === postSchema.marks.code)) return false;
    if (previousParent && previousParent !== parent) appendSeparator(parts, offsetToPosition);
    appendText(parts, offsetToPosition, node.text, pos);
    previousParent = parent;
    return false;
  });

  return {
    text: parts.join(""),
    offsetToPosition,
  };
};

const mapOffsetToPosition = (
  projection: WritingFeedbackProjection,
  offset: number,
  direction: 1 | -1,
) => {
  for (
    let index = Math.max(0, Math.min(offset, projection.offsetToPosition.length - 1));
    index >= 0 && index < projection.offsetToPosition.length;
    index += direction
  ) {
    const position = projection.offsetToPosition[index];
    if (typeof position === "number") return position;
  }
  return null;
};

export const mapWritingFeedbackSpan = (
  projection: WritingFeedbackProjection,
  from: number,
  to: number,
) => {
  const start = mapOffsetToPosition(projection, from, 1);
  const end = mapOffsetToPosition(projection, to, -1);
  return start == null || end == null || start >= end ? null : { from: start, to: end };
};

export const writingFeedbackKind = (kind: string) =>
  (kind === "Spelling" || kind === "Typo" ? "spelling" : "grammar") satisfies WritingFeedbackKind;

export const dictionaryWordKey = (word: string) =>
  word
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-GB");

export const writingFeedbackPatternKey = ({
  rule,
  kind,
  message,
  problemText = "",
  suggestions,
}: {
  rule: string;
  kind: string;
  message: string;
  problemText?: string;
  suggestions: WritingFeedbackSuggestion[];
}) => {
  const normalizedRule = rule.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, "_");
  const normalizedProblemText = dictionaryWordKey(problemText);
  const normalizedMessage = message
    .toLocaleLowerCase("en-GB")
    .replace(/"[^"]+"|'[^']+'|`[^`]+`|“[^”]+”|‘[^’]+’/g, "{term}")
    .replace(/[^\p{L}\p{N}{}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  const suggestionKinds = suggestions.map((suggestion) => suggestion.kind).join(",");
  return `rule:${normalizedRule}|kind:${kind}|message:${normalizedMessage}|example:${normalizedProblemText}|suggestions:${suggestionKinds}`;
};

export const writingFeedbackSuggestionKind = (
  kind: number,
): WritingFeedbackSuggestion["kind"] | null => {
  if (kind === 0) return "replace";
  if (kind === 1) return "remove";
  if (kind === 2) return "insertAfter";
  return null;
};

export const toWritingFeedbackSuggestion = (
  suggestion: Pick<HarperSuggestion, "kind" | "get_replacement_text">,
): WritingFeedbackSuggestion | null => {
  const kind = writingFeedbackSuggestionKind(suggestion.kind());
  if (!kind) return null;
  return {
    kind,
    replacementText: suggestion.get_replacement_text(),
  };
};

export const createWritingFeedbackIssues = (
  projection: WritingFeedbackProjection,
  lints: WritingFeedbackLint[],
  preferences: WritingFeedbackPreferences = {},
) => {
  const postSuppressionKeys = new Set(preferences.postSuppressionKeys ?? []);
  const globalSuppressionKeys = new Set(preferences.globalSuppressionKeys ?? []);
  const dictionaryWords = new Set([
    ...(preferences.postDictionaryWords ?? []).map(dictionaryWordKey),
    ...(preferences.globalDictionaryWords ?? []).map(dictionaryWordKey),
  ]);

  return lints.flatMap((lint, index): WritingFeedbackIssue[] => {
    const contextHash = lint.contextHash ?? "";
    const patternKey = lint.patternKey ?? "";
    const problemText = lint.problemText ?? "";
    if (postSuppressionKeys.has(contextHash)) return [];
    if (globalSuppressionKeys.has(patternKey)) return [];
    if (
      writingFeedbackKind(lint.kind) === "spelling" &&
      dictionaryWords.has(dictionaryWordKey(problemText))
    ) {
      return [];
    }
    const range = mapWritingFeedbackSpan(projection, lint.from, lint.to);
    if (!range) return [];
    const kind = writingFeedbackKind(lint.kind);
    const id = `writing-feedback-${range.from}-${range.to}-${kind}-${index}`;
    const anchorName = `--${id}`;
    return [
      {
        id,
        anchorName,
        from: range.from,
        to: range.to,
        message: lint.message,
        problemText,
        contextHash,
        patternKey,
        sourceKind: lint.kind,
        kind,
        suggestions: lint.suggestions ?? [],
      },
    ];
  });
};

export const createWritingFeedbackDecorations = (
  doc: ProseMirrorNode,
  issues: WritingFeedbackIssue[],
  activeId: string | null = null,
) => {
  const decorations = issues.map((issue) => {
    const activeClass = issue.id === activeId ? " writing-feedback-active" : "";
    return Decoration.inline(issue.from, issue.to, {
      class: `writing-feedback writing-feedback-${issue.kind}${activeClass}`,
      "data-writing-feedback-id": issue.id,
      "data-writing-feedback-kind": issue.kind,
      "data-writing-feedback-message": issue.message,
      style: `anchor-name: ${issue.anchorName}; --writing-feedback-anchor: ${issue.anchorName};`,
    });
  });
  return DecorationSet.create(doc, decorations);
};

export const toWritingFeedbackLint = async (
  lint: HarperLint,
  client: Pick<WritingFeedbackClient, "contextHash">,
  text: string,
  rule: string,
): Promise<WritingFeedbackLint> => {
  const span = lint.span();
  const suggestions = lint.suggestions().flatMap((suggestion) => {
    const result = toWritingFeedbackSuggestion(suggestion);
    suggestion.free();
    return result ? [result] : [];
  });
  const kind = lint.lint_kind();
  const message = lint.message();
  const problemText = lint.get_problem_text();
  const result = {
    from: span.start,
    to: span.end,
    message,
    kind,
    problemText,
    contextHash: (await client.contextHash(text, lint)).toString(),
    patternKey: writingFeedbackPatternKey({ rule, kind, message, problemText, suggestions }),
    suggestions,
  };
  span.free();
  lint.free();
  return result;
};

const collectWritingFeedbackLints = async (
  client: WritingFeedbackClient,
  text: string,
) => {
  const organized = await client.organizedLints(text, lintOptions);
  const lints = Object.entries(organized).flatMap(([rule, ruleLints]) =>
    ruleLints.map((lint) => ({ rule, lint })),
  );
  return Promise.all(
    lints.map(({ rule, lint }) => toWritingFeedbackLint(lint, client, text, rule)),
  );
};

const mapWritingFeedbackIssues = (
  issues: WritingFeedbackIssue[],
  mapping: Parameters<DecorationSet["map"]>[0],
) =>
  issues.flatMap((issue): WritingFeedbackIssue[] => {
    const from = mapping.mapResult(issue.from, 1);
    const to = mapping.mapResult(issue.to, -1);
    if (from.deleted || to.deleted || from.pos >= to.pos) return [];
    return [{ ...issue, from: from.pos, to: to.pos }];
  });

const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const addUniqueString = (values: string[], value: string) =>
  values.includes(value) ? values : [...values, value];

const writingFeedbackPreferencesFromState = (
  state: Pick<
    WritingFeedbackPluginState,
    | "globalDictionaryWords"
    | "globalSuppressionKeys"
    | "postDictionaryWords"
    | "postSuppressionKeys"
  >,
): Required<WritingFeedbackPreferences> => ({
  postSuppressionKeys: state.postSuppressionKeys,
  globalSuppressionKeys: state.globalSuppressionKeys,
  postDictionaryWords: state.postDictionaryWords,
  globalDictionaryWords: state.globalDictionaryWords,
});

const isWritingFeedbackIssueSuppressed = (
  issue: WritingFeedbackIssue,
  preferences: WritingFeedbackPreferences,
) => {
  if ((preferences.postSuppressionKeys ?? []).includes(issue.contextHash)) return true;
  if ((preferences.globalSuppressionKeys ?? []).includes(issue.patternKey)) return true;
  if (issue.kind !== "spelling") return false;
  const dictionaryWords = new Set([
    ...(preferences.postDictionaryWords ?? []).map(dictionaryWordKey),
    ...(preferences.globalDictionaryWords ?? []).map(dictionaryWordKey),
  ]);
  return dictionaryWords.has(dictionaryWordKey(issue.problemText));
};

const filterWritingFeedbackIssues = (
  issues: WritingFeedbackIssue[],
  preferences: WritingFeedbackPreferences,
) => issues.filter((issue) => !isWritingFeedbackIssueSuppressed(issue, preferences));

export const getActiveWritingFeedbackIssue = (state: EditorState) => {
  const pluginState = writingFeedbackPluginKey.getState(state);
  if (!pluginState?.activeId) return null;
  return pluginState.issues.find((issue) => issue.id === pluginState.activeId) ?? null;
};

export const dismissWritingFeedback = (state: EditorState) => {
  if (!writingFeedbackPluginKey.getState(state)?.activeId) return null;
  return state.tr.setMeta(writingFeedbackPluginKey, { type: "close" } satisfies WritingFeedbackMeta);
};

export const applyWritingFeedbackSuggestion = (state: EditorState, suggestionIndex: number) => {
  const issue = getActiveWritingFeedbackIssue(state);
  const suggestion = issue?.suggestions[suggestionIndex];
  if (!issue || !suggestion || issue.from < 0 || issue.to > state.doc.content.size) {
    return null;
  }

  const transaction = state.tr;
  if (suggestion.kind === "remove") transaction.delete(issue.from, issue.to);
  if (suggestion.kind === "replace") {
    transaction.insertText(suggestion.replacementText, issue.from, issue.to);
  }
  if (suggestion.kind === "insertAfter") {
    transaction.insertText(suggestion.replacementText, issue.to, issue.to);
  }

  return transaction.setMeta(writingFeedbackPluginKey, {
    type: "resolve",
    issueId: issue.id,
  } satisfies WritingFeedbackMeta);
};

export const suppressWritingFeedbackIssue = (
  state: EditorState,
  scope: "post" | "global",
) => {
  const issue = getActiveWritingFeedbackIssue(state);
  if (!issue) return null;
  const key = scope === "post" ? issue.contextHash : issue.patternKey;
  if (!key) return null;
  return state.tr.setMeta(writingFeedbackPluginKey, {
    type: "suppress",
    issueId: issue.id,
    scope,
  } satisfies WritingFeedbackMeta);
};

export const addWritingFeedbackIssueToDictionary = (
  state: EditorState,
  scope: "post" | "global",
) => {
  const issue = getActiveWritingFeedbackIssue(state);
  if (!issue || issue.kind !== "spelling") return null;
  const word = issue.problemText.trim();
  if (!word) return null;
  return state.tr.setMeta(writingFeedbackPluginKey, {
    type: "addDictionaryWord",
    issueId: issue.id,
    scope,
    word,
  } satisfies WritingFeedbackMeta);
};

export const createWritingFeedbackPlugin = ({
  createClient = createDefaultHarperClient,
  debounceMs = WRITING_FEEDBACK_DEBOUNCE_MS,
  preferences = {},
}: WritingFeedbackPluginOptions = {}) => {
  const initialPostSuppressionKeys = uniqueStrings(preferences.postSuppressionKeys ?? []);
  const initialGlobalSuppressionKeys = uniqueStrings(preferences.globalSuppressionKeys ?? []);
  const initialPostDictionaryWords = uniqueStrings(preferences.postDictionaryWords ?? []);
  const initialGlobalDictionaryWords = uniqueStrings(preferences.globalDictionaryWords ?? []);

  return new Plugin<WritingFeedbackPluginState>({
    key: writingFeedbackPluginKey,
    state: {
      init: () => ({
        decorations: DecorationSet.empty,
        issues: [],
        activeId: null,
        requestId: 0,
        postSuppressionKeys: initialPostSuppressionKeys,
        globalSuppressionKeys: initialGlobalSuppressionKeys,
        postDictionaryWords: initialPostDictionaryWords,
        globalDictionaryWords: initialGlobalDictionaryWords,
      }),
      apply(transaction, value, _oldState, newState) {
        const mappedIssues = transaction.docChanged
          ? mapWritingFeedbackIssues(value.issues, transaction.mapping)
          : value.issues;
        const mappedActiveId =
          value.activeId && mappedIssues.some((issue) => issue.id === value.activeId)
            ? value.activeId
            : null;
        const mappedDecorations = createWritingFeedbackDecorations(
          newState.doc,
          mappedIssues,
          mappedActiveId,
        );
        const meta = transaction.getMeta(writingFeedbackPluginKey);
        if (!isWritingFeedbackMeta(meta)) {
          return {
            ...value,
            issues: mappedIssues,
            activeId: mappedActiveId,
            decorations: mappedDecorations,
          };
        }

        if (meta.type === "open") {
          const activeId = mappedIssues.some((issue) => issue.id === meta.issueId)
            ? meta.issueId
            : null;
          return {
            ...value,
            issues: mappedIssues,
            activeId,
            decorations: createWritingFeedbackDecorations(newState.doc, mappedIssues, activeId),
          };
        }

        if (meta.type === "close") {
          return {
            ...value,
            issues: mappedIssues,
            activeId: null,
            decorations: createWritingFeedbackDecorations(newState.doc, mappedIssues),
          };
        }

        if (meta.type === "resolve") {
          const issues = mappedIssues.filter((issue) => issue.id !== meta.issueId);
          const activeId = mappedActiveId === meta.issueId ? null : mappedActiveId;
          return {
            ...value,
            issues,
            activeId,
            decorations: createWritingFeedbackDecorations(newState.doc, issues, activeId),
          };
        }

        if (meta.type === "suppress") {
          const issue = mappedIssues.find((item) => item.id === meta.issueId);
          if (!issue) {
            return {
              ...value,
              issues: mappedIssues,
              activeId: mappedActiveId,
              decorations: mappedDecorations,
            };
          }
          const postSuppressionKeys =
            meta.scope === "post"
              ? addUniqueString(value.postSuppressionKeys, issue.contextHash)
              : value.postSuppressionKeys;
          const globalSuppressionKeys =
            meta.scope === "global"
              ? addUniqueString(value.globalSuppressionKeys, issue.patternKey)
              : value.globalSuppressionKeys;
          const preferences = writingFeedbackPreferencesFromState({
            ...value,
            postSuppressionKeys,
            globalSuppressionKeys,
          });
          const issues = filterWritingFeedbackIssues(mappedIssues, preferences);
          return {
            ...value,
            issues,
            activeId: null,
            postSuppressionKeys,
            globalSuppressionKeys,
            decorations: createWritingFeedbackDecorations(newState.doc, issues),
          };
        }

        if (meta.type === "addDictionaryWord") {
          const word = meta.word.trim();
          const postDictionaryWords =
            meta.scope === "post"
              ? addUniqueString(value.postDictionaryWords, word)
              : value.postDictionaryWords;
          const globalDictionaryWords =
            meta.scope === "global"
              ? addUniqueString(value.globalDictionaryWords, word)
              : value.globalDictionaryWords;
          const wordKey = dictionaryWordKey(word);
          const issues = mappedIssues.filter(
            (issue) =>
              issue.id !== meta.issueId &&
              !(issue.kind === "spelling" && dictionaryWordKey(issue.problemText) === wordKey),
          );
          return {
            ...value,
            issues,
            activeId: null,
            postDictionaryWords,
            globalDictionaryWords,
            decorations: createWritingFeedbackDecorations(newState.doc, issues),
          };
        }

        if (meta.type === "start") {
          return {
            decorations: mappedDecorations,
            issues: mappedIssues,
            activeId: mappedActiveId,
            requestId: Math.max(value.requestId, meta.requestId),
            postSuppressionKeys: value.postSuppressionKeys,
            globalSuppressionKeys: value.globalSuppressionKeys,
            postDictionaryWords: value.postDictionaryWords,
            globalDictionaryWords: value.globalDictionaryWords,
          };
        }

        if (meta.requestId !== value.requestId) {
          return {
            ...value,
            issues: mappedIssues,
            activeId: mappedActiveId,
            decorations: mappedDecorations,
          };
        }
        if (meta.doc && !newState.doc.eq(meta.doc)) {
          return {
            ...value,
            issues: mappedIssues,
            activeId: mappedActiveId,
            decorations: mappedDecorations,
          };
        }

        if (meta.type === "finish") {
          return {
            decorations: createWritingFeedbackDecorations(newState.doc, meta.issues),
            issues: meta.issues,
            activeId: null,
            requestId: value.requestId,
            postSuppressionKeys: value.postSuppressionKeys,
            globalSuppressionKeys: value.globalSuppressionKeys,
            postDictionaryWords: value.postDictionaryWords,
            globalDictionaryWords: value.globalDictionaryWords,
          };
        }

        return {
          decorations: DecorationSet.empty,
          issues: [],
          activeId: null,
          requestId: value.requestId,
          postSuppressionKeys: value.postSuppressionKeys,
          globalSuppressionKeys: value.globalSuppressionKeys,
          postDictionaryWords: value.postDictionaryWords,
          globalDictionaryWords: value.globalDictionaryWords,
        };
      },
    },
    props: {
      decorations(state) {
        return writingFeedbackPluginKey.getState(state)?.decorations ?? null;
      },
      handleClick(view, _position, event) {
        const target = event.target;
        const element = target instanceof Element ? target.closest(".writing-feedback") : null;
        const issueId = element?.getAttribute("data-writing-feedback-id");
        if (issueId) {
          view.dispatch(
            view.state.tr.setMeta(writingFeedbackPluginKey, {
              type: "open",
              issueId,
            } satisfies WritingFeedbackMeta),
          );
          return true;
        }

        const transaction = dismissWritingFeedback(view.state);
        if (transaction) view.dispatch(transaction);
        return false;
      },
      handleKeyDown(view, event) {
        if (event.key !== "Escape") return false;
        const transaction = dismissWritingFeedback(view.state);
        if (!transaction) return false;
        event.preventDefault();
        view.dispatch(transaction);
        return true;
      },
    },
    view(view) {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let requestId = 0;
      let disposed = false;
      let clientPromise: Promise<WritingFeedbackClient> | null = null;
      const importedDictionaryWordKeys = new Set<string>();
      const root = view.root;

      const closeOnOutsidePointerDown = (event: Event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".writing-feedback") || target.closest(".writing-feedback-popover")) {
          return;
        }
        const transaction = dismissWritingFeedback(view.state);
        if (transaction) view.dispatch(transaction);
      };

      root.addEventListener("pointerdown", closeOnOutsidePointerDown, true);

      const getClient = () => {
        clientPromise ??= createClient();
        return clientPromise;
      };

      const dictionaryWordsFromState = () => {
        const state = writingFeedbackPluginKey.getState(view.state);
        if (!state) return [];
        return uniqueStrings([...state.postDictionaryWords, ...state.globalDictionaryWords]);
      };

      const importDictionaryWords = async () => {
        const words = dictionaryWordsFromState().filter((word) => {
          const key = dictionaryWordKey(word);
          return Boolean(key && !importedDictionaryWordKeys.has(key));
        });
        if (words.length === 0) return;
        const client = await getClient();
        await client.importWords(words);
        for (const word of words) importedDictionaryWordKeys.add(dictionaryWordKey(word));
      };

      const schedule = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          timeout = null;
          const currentRequestId = ++requestId;
          const doc = view.state.doc;
          const projection = projectWritingFeedbackText(doc);

          view.dispatch(
            view.state.tr.setMeta(writingFeedbackPluginKey, {
              type: "start",
              requestId: currentRequestId,
            } satisfies WritingFeedbackMeta),
          );

          if (!projection.text.trim()) {
            view.dispatch(
              view.state.tr.setMeta(writingFeedbackPluginKey, {
                type: "clear",
                requestId: currentRequestId,
                doc,
              } satisfies WritingFeedbackMeta),
            );
            return;
          }

          void getClient()
            .then(async (client) => {
              await importDictionaryWords();
              const lintStartedAt = performance.now();
              const lints = await collectWritingFeedbackLints(client, projection.text);
              devLog("lint", {
                durationMs: Math.round(performance.now() - lintStartedAt),
                textLength: projection.text.length,
                lintCount: lints.length,
              });
              return lints;
            })
            .then((lints) => {
              if (disposed) return;
              const state = view.state;
              const pluginState = writingFeedbackPluginKey.getState(state);
              const issues = createWritingFeedbackIssues(
                projection,
                lints,
                pluginState ? writingFeedbackPreferencesFromState(pluginState) : {},
              );
              view.dispatch(
                state.tr.setMeta(writingFeedbackPluginKey, {
                  type: "finish",
                  requestId: currentRequestId,
                  doc,
                  issues,
                } satisfies WritingFeedbackMeta),
              );
            })
            .catch((error: unknown) => {
              if (disposed) return;
              devWarn("lint failed", error);
              view.dispatch(
                view.state.tr.setMeta(writingFeedbackPluginKey, {
                  type: "clear",
                  requestId: currentRequestId,
                  doc,
                } satisfies WritingFeedbackMeta),
              );
            });
        }, debounceMs);
      };

      schedule();

      return {
        update(_view, previousState) {
          const previousPluginState = writingFeedbackPluginKey.getState(previousState);
          const currentPluginState = writingFeedbackPluginKey.getState(view.state);
          if (
            previousPluginState &&
            currentPluginState &&
            (previousPluginState.postDictionaryWords !== currentPluginState.postDictionaryWords ||
              previousPluginState.globalDictionaryWords !== currentPluginState.globalDictionaryWords)
          ) {
            void importDictionaryWords().catch((error: unknown) =>
              devWarn("dictionary import failed", error),
            );
          }
          if (previousState.doc !== view.state.doc) schedule();
        },
        destroy() {
          disposed = true;
          if (timeout) clearTimeout(timeout);
          root.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
          void clientPromise?.then((client) => client.dispose());
        },
      };
    },
  });
};

export const writingFeedbackPlugin = createWritingFeedbackPlugin();
