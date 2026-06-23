import type { JSONContent, JSONValue } from "./post-content-json";

export type SupportedCodeLanguageId =
  | "typescript"
  | "javascript"
  | "jsx"
  | "tsx"
  | "css"
  | "html"
  | "json"
  | "markdown"
  | "bash"
  | "python"
  | "rust"
  | "graphql";

export type HighlightRange = {
  from: number;
  to: number;
};

export type CodeLanguage = {
  id: SupportedCodeLanguageId;
  label: string;
  shikiId: string;
  aliases: readonly string[];
};

export const DEFAULT_CODE_LANGUAGE: SupportedCodeLanguageId = "typescript";

export const CODE_LANGUAGES = [
  { id: "typescript", label: "TypeScript", shikiId: "ts", aliases: ["ts"] },
  { id: "javascript", label: "JavaScript", shikiId: "js", aliases: ["js"] },
  { id: "jsx", label: "JSX", shikiId: "jsx", aliases: [] },
  { id: "tsx", label: "TSX", shikiId: "tsx", aliases: [] },
  { id: "css", label: "CSS", shikiId: "css", aliases: [] },
  { id: "html", label: "HTML", shikiId: "html", aliases: ["markup"] },
  { id: "json", label: "JSON", shikiId: "json", aliases: [] },
  { id: "markdown", label: "Markdown", shikiId: "md", aliases: ["md"] },
  { id: "bash", label: "Bash", shikiId: "bash", aliases: ["shell", "sh", "zsh"] },
  { id: "python", label: "Python", shikiId: "python", aliases: ["py"] },
  { id: "rust", label: "Rust", shikiId: "rust", aliases: ["rs"] },
  { id: "graphql", label: "GraphQL", shikiId: "graphql", aliases: ["gql"] },
] as const satisfies readonly CodeLanguage[];

const languagesById = new Map(CODE_LANGUAGES.map((language) => [language.id, language]));
const languageIdsByAlias = new Map<string, SupportedCodeLanguageId>();

for (const language of CODE_LANGUAGES) {
  languageIdsByAlias.set(language.id, language.id);
  languageIdsByAlias.set(language.label.toLowerCase(), language.id);
  for (const alias of language.aliases) languageIdsByAlias.set(alias, language.id);
}

export class UnsupportedCodeLanguageError extends Error {
  constructor(readonly language: string) {
    super(`Unsupported code language: ${language}`);
    this.name = "UnsupportedCodeLanguageError";
  }
}

export const isSupportedCodeLanguage = (value: unknown): value is SupportedCodeLanguageId =>
  typeof value === "string" && languagesById.has(value as SupportedCodeLanguageId);

export const getCodeLanguage = (value: SupportedCodeLanguageId) => languagesById.get(value);

export const parseCodeLanguage = (value: unknown): SupportedCodeLanguageId | null => {
  if (typeof value !== "string") return null;
  return languageIdsByAlias.get(value.trim().toLowerCase()) ?? null;
};

export const requireCodeLanguage = (value: unknown): SupportedCodeLanguageId => {
  const language = parseCodeLanguage(value);
  if (!language) throw new UnsupportedCodeLanguageError(String(value ?? ""));
  return language;
};

export const getTextFromContent = (node: JSONContent): string => {
  if (node.type === "text") return node.text ?? "";
  return node.content?.map(getTextFromContent).join("") ?? "";
};

export const getLineCount = (text: string) => text.split("\n").length;

export const normalizeHighlightRanges = (
  value: unknown,
  lineCount: number,
): HighlightRange[] => {
  if (!Array.isArray(value) || lineCount < 1) return [];

  const ranges = value
    .map((range): HighlightRange | null => {
      if (!range || typeof range !== "object") return null;
      const raw = range as Record<string, unknown>;
      const from = Number(raw.from);
      const to = Number(raw.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
      const start = Math.max(1, Math.min(Math.trunc(Math.min(from, to)), lineCount));
      const end = Math.max(1, Math.min(Math.trunc(Math.max(from, to)), lineCount));
      return { from: start, to: end };
    })
    .filter((range): range is HighlightRange => range !== null)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const merged: HighlightRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
};

export const lineIsHighlighted = (line: number, ranges: readonly HighlightRange[]) =>
  ranges.some((range) => line >= range.from && line <= range.to);

export const toggleHighlightedLine = (
  ranges: readonly HighlightRange[],
  line: number,
  lineCount: number,
) => {
  if (lineIsHighlighted(line, ranges)) {
    return normalizeHighlightRanges(
      ranges.flatMap((range) => {
        if (line < range.from || line > range.to) return [range];
        if (range.from === range.to) return [];
        if (line === range.from) return [{ from: range.from + 1, to: range.to }];
        if (line === range.to) return [{ from: range.from, to: range.to - 1 }];
        return [
          { from: range.from, to: line - 1 },
          { from: line + 1, to: range.to },
        ];
      }),
      lineCount,
    );
  }

  return normalizeHighlightRanges([...ranges, { from: line, to: line }], lineCount);
};

export const addHighlightedRange = (
  ranges: readonly HighlightRange[],
  from: number,
  to: number,
  lineCount: number,
) => normalizeHighlightRanges([...ranges, { from, to }], lineCount);

const jsonAttrs = (attrs: Record<string, JSONValue | undefined>) => attrs;

const languageHintText = (node: JSONContent) => {
  if (node.type !== "paragraph") return null;
  const text = getTextFromContent(node).trim();
  if (!text || /\s/.test(text)) return null;
  return parseCodeLanguage(text);
};

const normalizeCodeBlock = (node: JSONContent, hintedLanguage?: SupportedCodeLanguageId) => {
  const text = getTextFromContent(node);
  const lineCount = getLineCount(text);
  const attrs = node.attrs ?? {};
  const language = parseCodeLanguage(attrs.language) ?? hintedLanguage ?? DEFAULT_CODE_LANGUAGE;
  const highlightRanges = normalizeHighlightRanges(attrs.highlightRanges, lineCount) as unknown as
    | JSONValue
    | undefined;
  return {
    ...node,
    attrs: jsonAttrs({
      ...attrs,
      language,
      highlightRanges,
    }),
  };
};

export const migrateCodeBlockLanguageHints = (content: JSONContent): JSONContent => {
  if (!content.content) {
    return content.type === "codeBlock" ? normalizeCodeBlock(content) : content;
  }

  const children: JSONContent[] = [];
  for (let index = 0; index < content.content.length; index += 1) {
    const child = migrateCodeBlockLanguageHints(content.content[index]!);
    const next = content.content[index + 1];
    const hintedLanguage = languageHintText(child);

    if (hintedLanguage && next?.type === "codeBlock") {
      children.push(normalizeCodeBlock(migrateCodeBlockLanguageHints(next), hintedLanguage));
      index += 1;
      continue;
    }

    children.push(child.type === "codeBlock" ? normalizeCodeBlock(child) : child);
  }

  return { ...content, content: children };
};

export const getCodeBlockAttrs = (node: JSONContent) => {
  const attrs = node.attrs ?? {};
  const language = requireCodeLanguage(attrs.language);
  return {
    language,
    highlightRanges: normalizeHighlightRanges(
      attrs.highlightRanges,
      getLineCount(getTextFromContent(node)),
    ),
  };
};
