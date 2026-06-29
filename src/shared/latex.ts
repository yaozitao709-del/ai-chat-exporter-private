export function normalizeLatex(value: string): string {
  return normalizeAlignedEnvironment(
    value
      .replace(/\u00a0/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\\\\\s*\[[^\]]+\]/g, "\\\\")
      .replace(/^\s*\\\(|\\\)\s*$/g, "")
      .replace(/^\s*\\\[|\\\]\s*$/g, "")
      .replace(/^\s*\$\$?|\$\$?\s*$/g, "")
      .replace(/[\u2061-\u2064]/g, "")
      .trim()
  );
}

export function normalizeLatexForConverter(value: string): string {
  return normalizeLatex(value)
    .replace(/\\(?:left|right)\s*\./g, "")
    .replace(/\\(?:left|right)\s*/g, "")
    .replace(/\\middle\s*/g, "")
    .replace(/\\(?:qquad|quad)\b/g, " ")
    .replace(/\\[,;:!]/g, "")
    .replace(/\\displaystyle\b/g, "")
    .replace(/[\u2061-\u2064]/g, "")
    .trim();
}

export function normalizeLatexKey(value: string): string {
  return normalizeLatexForConverter(value).replace(/\s+/g, "");
}

export function extractLatexSourceText(value: string): string | undefined {
  let text = value.replace(/\u00a0/g, " ").trim();
  if (!text) return undefined;

  text = text.replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();

  const hadLatexLabel = /^\s*(?:LaTeX|LATEX|latex)/.test(text);
  if (hadLatexLabel) {
    text = text.replace(/^\s*(?:LaTeX|LATEX|latex)\s*[:：]?\s*/i, "").trim();
  } else {
    text = text.replace(/^\s*(?:TeX|tex)\b\s*[:：]?\s*/i, "").trim();
  }

  if (!text) return undefined;
  if (!hadLatexLabel && !looksLikeLatex(text)) return undefined;
  if (!hadLatexLabel && looksLikeProgrammingCode(text)) return undefined;

  return normalizeLatex(text);
}

function normalizeAlignedEnvironment(value: string): string {
  return value.replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, (_match, body: string) => {
    return `\\begin{aligned}${body.replace(/&/g, "")}\\end{aligned}`;
  });
}

function looksLikeLatex(value: string): boolean {
  return /\\[a-zA-Z]+|[_^]\{|\\\(|\\\[|\\begin\{/.test(value);
}

function looksLikeProgrammingCode(value: string): boolean {
  return /\b(?:function|const|let|var|class|import|export|return|=>)\b/.test(value) && !/\\(?:frac|sum|int|begin|alpha|beta|partial)/.test(value);
}
