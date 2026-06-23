import vitesseLight from "shiki/themes/vitesse-light.mjs";
import {
  createHighlighter,
  createJavaScriptRegexEngine,
  type ShikiTransformer,
} from "shiki";
import {
  CODE_LANGUAGES,
  getCodeBlockAttrs,
  getCodeLanguage,
  getTextFromContent,
  lineIsHighlighted,
  migrateCodeBlockLanguageHints,
} from "./code-blocks";
import type { JSONContent, JSONValue } from "./post-content-json";

const theme = {
  ...vitesseLight,
  name: "andrewingram-light",
};

const shikiLanguageIds = [...new Set(CODE_LANGUAGES.map((language) => language.shikiId))];

const highlighterPromise = createHighlighter({
  engine: createJavaScriptRegexEngine(),
  themes: [theme],
  langs: shikiLanguageIds,
});

const lineTransformer = (
  languageLabel: string,
  ranges: ReturnType<typeof getCodeBlockAttrs>["highlightRanges"],
): ShikiTransformer => ({
  name: "post-code-block-lines",
  pre(node) {
    this.addClassToHast(node, "post-code-block");
    node.properties["data-language"] = languageLabel;
  },
  code(node) {
    this.addClassToHast(node, "post-code-block-code");
  },
  line(node, line) {
    node.properties["data-line"] = String(line);
    if (lineIsHighlighted(line, ranges)) this.addClassToHast(node, "is-highlighted");
  },
});

export const highlightCodeBlock = async (node: JSONContent) => {
  const { language, highlightRanges } = getCodeBlockAttrs(node);
  const languageDefinition = getCodeLanguage(language);
  if (!languageDefinition) throw new Error(`Unsupported code language: ${language}`);

  const highlighter = await highlighterPromise;
  return highlighter.codeToHtml(getTextFromContent(node), {
    lang: languageDefinition.shikiId,
    theme: theme.name,
    transformers: [lineTransformer(languageDefinition.label, highlightRanges)],
  });
};

const prepareMigratedPostContentForRender = async (content: JSONContent): Promise<JSONContent> => {
  if (content.type === "codeBlock") {
    const highlightedHtml = await highlightCodeBlock(content);
    return {
      ...content,
      attrs: {
        ...content.attrs,
        highlightedHtml: highlightedHtml as JSONValue,
      },
    };
  }

  if (!content.content) return content;

  return {
    ...content,
    content: await Promise.all(content.content.map(prepareMigratedPostContentForRender)),
  };
};

export const preparePostContentForRender = async (content: JSONContent) =>
  prepareMigratedPostContentForRender(migrateCodeBlockLanguageHints(content));
