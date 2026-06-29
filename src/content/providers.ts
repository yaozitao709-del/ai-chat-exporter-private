import { markdownToBlocks, normalizeMarkdownText } from "../shared/markdown";
import { extractLatexSourceText, normalizeLatex, normalizeLatexKey } from "../shared/latex";
import type {
  Conversation,
  LoadConversationOptions,
  LoadConversationResult,
  Message,
  MessageRole,
  ProviderAdapter,
  ProviderId
} from "../shared/types";

const BLOCK_TAGS = new Set(["ARTICLE", "SECTION", "DIV", "P", "LI", "UL", "OL", "PRE", "TABLE", "BLOCKQUOTE"]);
const SKIP_CLASS_PARTS = [
  "katex-html",
  "katex-mathml",
  "MJX_Assistive_MathML",
  "mjx-assistive-mml",
  "message-actions",
  "model-response-label-announcer",
  "response-container-header",
  "cdk-visually-hidden",
  "screen-reader",
  "copy-button",
  "download-button",
  "more-menu-button",
  "share-and-export-menu-button",
  "action-btn",
  "actions-",
  "header-wrapper-",
  "code-block-banner"
];
const SKIP_TAGS = new Set([
  "STYLE",
  "SCRIPT",
  "SVG",
  "BUTTON",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "NOSCRIPT",
  "MAT-ICON",
  "MAT-MENU",
  "MESSAGE-ACTIONS",
  "COPY-BUTTON",
  "GEM-ICON",
  "GEM-ICON-BUTTON",
  "MODEL-RESPONSE-DISCLAIMERS",
  "HALLUCINATION-DISCLAIMER",
  "FREEMIUM-RAG-DISCLAIMER",
  "FREEMIUM-FILE-UPLOAD-NEAR-QUOTA-DISCLAIMER",
  "FREEMIUM-FILE-UPLOAD-QUOTA-EXCEEDED-DISCLAIMER",
  "CONDENSED-TOS-DISCLAIMER",
  "INPUT-CONTAINER",
  "RICH-TEXTAREA"
]);
const MESSAGE_SELECTOR = [
  "user-query",
  "model-response",
  ".ds-message",
  "[data-message-id]",
  "[data-message-author-role]",
  "[data-test-id*='conversation']",
  "[data-test-id*='message']",
  "[data-testid*='message']",
  "[class*='message']",
  "[class*='conversation-turn']",
  "message-content",
  ".ds-markdown",
  "[class*='markdown']",
  "[class*='model-response']",
  "[class*='query-text']",
  "[class*='answer']",
  "[class*='bubble']",
  "article"
].join(",");

export function getActiveProviderAdapter(): ProviderAdapter | undefined {
  return providerAdapters.find((adapter) => adapter.detect());
}

export const providerAdapters: ProviderAdapter[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    detect: () => ["chatgpt.com", "chat.openai.com"].includes(location.hostname),
    loadCompleteConversation: (options) => loadCompleteConversation(options),
    extractConversation: () =>
      extractBySelectors({
        provider: "chatgpt",
        messageSelectors: ["[data-testid^='conversation-turn-'] [data-message-author-role]", "[data-message-author-role]"],
        getRole: (element, index) => {
          const role = element.getAttribute("data-message-author-role") ?? element.closest("[data-message-author-role]")?.getAttribute("data-message-author-role");
          if (role === "user" || role === "assistant" || role === "system") return role;
          return alternatingRole(index);
        },
        contentSelector: ".markdown, [data-message-id], div",
        warning: "已尝试自动向上加载当前 ChatGPT 对话；如平台虚拟滚动限制，可能仍只包含已加载部分。"
      })
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    detect: () => location.hostname === "chat.deepseek.com",
    loadCompleteConversation: (options) => loadCompleteConversation(options),
    extractConversation: () =>
      extractBySelectors({
        provider: "deepseek",
        messageSelectors: [".dssxz-chat-main .ds-message", ".ds-virtual-list-visible-items .ds-message", ".ds-message"],
        contentSelector: ".ds-assistant-message-main-content, .ds-markdown, [class*='markdown'], pre, p, div",
        warning: "已尝试自动向上加载当前 DeepSeek 对话；如页面结构变动，可能需要重新适配选择器。"
      })
  },
  {
    id: "gemini",
    label: "Gemini",
    detect: () => location.hostname === "gemini.google.com" || location.hostname === "bard.google.com",
    loadCompleteConversation: (options) => loadCompleteConversation(options),
    extractConversation: () =>
      extractBySelectors({
        provider: "gemini",
        messageSelectors: [
          "infinite-scroller[data-test-id='chat-history-container'] user-query",
          "infinite-scroller[data-test-id='chat-history-container'] model-response",
          ".conversation-container user-query",
          ".conversation-container model-response",
          "user-query",
          "model-response"
        ],
        contentSelector:
          ".query-text, [data-test-id='luminous-collapsed-bubble'], message-content, .model-response-text, structured-content-container, response-container, [class*='markdown'], [class*='content'], pre, p, div",
        warning: "已尝试自动向上加载当前 Gemini 对话；已按你提供的 user-query/model-response DOM 优先提取。"
      })
  },
  {
    id: "doubao",
    label: "豆包",
    detect: () => location.hostname === "www.doubao.com" || location.hostname === "doubao.com",
    loadCompleteConversation: (options) => loadCompleteConversation(options),
    extractConversation: () =>
      extractBySelectors({
        provider: "doubao",
        messageSelectors: [
          "[data-message-id]",
          "[data-container-type='block-v2']",
          "[data-render-engine='node']",
          "[class*='md-box-root']",
          "[class*='message'] [class*='container-']"
        ],
        contentSelector:
          "[data-container-type='block-v2'], [data-render-engine='node'], [class*='md-box-root'], [class*='container-fBOrXO'], [class*='table-wrapper'], [class*='code-block-element'], [class*='content'], pre, p, div",
        warning: "已尝试自动向上加载当前豆包对话；已按你提供的 data-message-id/md-box DOM 优先提取。"
      })
  }
];

interface ExtractConfig {
  provider: ProviderId;
  messageSelectors: string[];
  contentSelector: string;
  getRole?: (element: Element, index: number) => MessageRole;
  warning: string;
}

async function loadCompleteConversation({ signal, onProgress }: LoadConversationOptions): Promise<LoadConversationResult> {
  const scroller = findBestScrollContainer();
  const startedCount = countLikelyMessages();
  const startedTop = getScrollTop(scroller);
  let previousCount = startedCount;
  let previousHeight = getScrollHeight(scroller);
  let stableRounds = 0;
  let iterations = 0;
  const maxIterations = 70;

  onProgress({
    phase: "loading",
    message: "正在自动向上加载历史对话...",
    discoveredMessages: startedCount,
    iterations
  });

  while (iterations < maxIterations) {
    throwIfAborted(signal);
    iterations += 1;
    scrollToTop(scroller);
    await wait(650, signal);

    const currentCount = countLikelyMessages();
    const currentHeight = getScrollHeight(scroller);
    const currentTop = getScrollTop(scroller);

    onProgress({
      phase: "loading",
      message: `正在加载历史：已发现约 ${currentCount} 条内容，第 ${iterations} 轮`,
      discoveredMessages: currentCount,
      iterations
    });

    const countChanged = currentCount !== previousCount;
    const heightChanged = Math.abs(currentHeight - previousHeight) > 4;
    const nearTop = currentTop <= 4;
    stableRounds = !countChanged && !heightChanged && nearTop ? stableRounds + 1 : 0;

    previousCount = currentCount;
    previousHeight = currentHeight;

    if (stableRounds >= 4) {
      onProgress({
        phase: "done",
        message: `历史加载完成，已发现约 ${currentCount} 条内容。`,
        discoveredMessages: currentCount,
        iterations
      });
      restoreOriginalPosition(scroller, startedTop);
      return {
        mode: "scroll",
        complete: true,
        timedOut: false,
        discoveredMessages: currentCount
      };
    }
  }

  onProgress({
    phase: "timeout",
    message: `自动加载达到上限，已发现约 ${previousCount} 条内容。`,
    discoveredMessages: previousCount,
    iterations
  });
  restoreOriginalPosition(scroller, startedTop);
  return {
    mode: "scroll",
    complete: false,
    timedOut: true,
    discoveredMessages: previousCount
  };
}

function extractBySelectors(config: ExtractConfig): Conversation {
  const candidates = uniqueElements(config.messageSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
  const messageElements = pruneNestedElements(candidates)
    .filter(isVisibleElement)
    .map((element) => pickBestContentElement(element, config.contentSelector))
    .filter((element): element is Element => Boolean(element))
    .filter(isLikelyMessageElement);

  const messages = dedupeMessages(
    messageElements.map((element, index) => buildMessage(config, element, index))
  ).filter((message) => message.contentMarkdown.length > 0);

  const fallbackMessages = messages.length > 0 ? messages : extractVisibleFallback(config.provider);

  return {
    title: extractTitle(),
    url: location.href,
    provider: config.provider,
    messages: fallbackMessages,
    extractedAt: new Date().toISOString(),
    partial: false,
    warning: config.warning
  };
}

function buildMessage(config: ExtractConfig, element: Element, index: number): Message {
  const contentMarkdown = normalizeMarkdownText(elementToMarkdown(element));
  return {
    id: `${config.provider}-${index}-${hashText(contentMarkdown || element.textContent || "")}`,
    role: config.getRole?.(element, index) ?? inferRole(element, index),
    contentMarkdown,
    blocks: markdownToBlocks(contentMarkdown),
    selected: true,
    createdAt: extractTimestamp(element)
  };
}

function extractVisibleFallback(provider: ProviderId): Message[] {
  const main = document.querySelector("main") ?? document.body;
  const blocks = Array.from(main.querySelectorAll("article, section, [role='article'], [class*='markdown'], pre"))
    .filter(isVisibleElement)
    .filter(isLikelyMessageElement);

  return dedupeMessages(
    blocks.map((element, index) => {
      const contentMarkdown = normalizeMarkdownText(elementToMarkdown(element));
      return {
        id: `${provider}-fallback-${index}-${hashText(contentMarkdown || element.textContent || "")}`,
        role: inferRole(element, index),
        contentMarkdown,
        blocks: markdownToBlocks(contentMarkdown),
        selected: true,
        createdAt: extractTimestamp(element)
      };
    })
  );
}

function pickBestContentElement(element: Element, selector: string): Element {
  for (const selectorPart of selector.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (element.matches(selectorPart) && isLikelyMessageElement(element)) return element;

    const matches = Array.from(element.querySelectorAll(selectorPart))
      .filter(isVisibleElement)
      .filter(isLikelyMessageElement)
      .sort((a, b) => scoreContentElement(b) - scoreContentElement(a));

    if (matches[0]) return matches[0];
  }

  return element;
}

function scoreContentElement(element: Element): number {
  const textLength = element.textContent?.length ?? 0;
  const mathScore = element.querySelectorAll("annotation[encoding='application/x-tex'], script[type*='math/tex'], .katex, mjx-container").length * 200;
  return textLength + mathScore;
}

function pruneNestedElements(elements: Element[]): Element[] {
  return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element) && similarText(other, element)));
}

function uniqueElements(elements: Element[]): Element[] {
  return Array.from(new Set(elements));
}

function similarText(parent: Element, child: Element): boolean {
  const parentText = normalizeWhitespace(parent.textContent || "");
  const childText = normalizeWhitespace(child.textContent || "");
  return childText.length > 0 && parentText.includes(childText) && parentText.length < childText.length * 1.4;
}

function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return true;
  if (element.closest("[data-ai-chat-exporter-root='true']")) return false;

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isLikelyMessageElement(element: Element): boolean {
  const text = normalizeWhitespace(element.textContent || "");
  const latexCount = element.querySelectorAll("annotation[encoding='application/x-tex'], script[type*='math/tex'], .katex, mjx-container").length;
  if (text.length < 2 && latexCount === 0) return false;
  if (text.length > 80_000) return false;

  const interactiveCount = element.querySelectorAll("button, input, textarea, select, nav, aside").length;
  if (interactiveCount > 16 && text.length < 800) return false;

  return true;
}

function dedupeMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const deduped: Message[] = [];

  for (const message of messages) {
    const key = normalizeWhitespace(message.contentMarkdown).slice(0, 700);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(message);
  }

  return deduped;
}

function inferRole(element: Element, index: number): MessageRole {
  const closestRole = element.closest("[data-message-author-role]")?.getAttribute("data-message-author-role");
  if (closestRole === "user" || closestRole === "assistant" || closestRole === "system") return closestRole;

  const tag = element.tagName.toUpperCase();
  if (tag === "USER-QUERY" || element.closest("user-query")) return "user";
  if (tag === "MODEL-RESPONSE" || tag === "MESSAGE-CONTENT" || tag === "RESPONSE-CONTAINER" || element.closest("model-response")) return "assistant";

  const roleAttr = [
    element.getAttribute("data-message-author-role"),
    element.getAttribute("data-role"),
    element.getAttribute("aria-label"),
    element.className?.toString()
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(assistant|bot|ai|model|回复|回答|助手)/i.test(roleAttr)) return "assistant";
  if (/(user|human|me|我|用户)/i.test(roleAttr)) return "user";
  return alternatingRole(index);
}

function alternatingRole(index: number): MessageRole {
  return index % 2 === 0 ? "user" : "assistant";
}

function extractTitle(): string {
  const titleFromPage = document.querySelector("h1")?.textContent?.trim();
  const browserTitle = document.title.replace(/[-|].*$/, "").trim();
  return titleFromPage || browserTitle || "AI 对话导出";
}

function extractTimestamp(element: Element): string | undefined {
  const time = element.querySelector("time");
  return time?.getAttribute("datetime") || time?.textContent?.trim() || undefined;
}

function elementToMarkdown(element: Element): string {
  return dedupeAdjacentMathBlocks(normalizeMarkdownText(renderNode(element)));
}

function renderNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof Element)) {
    return "";
  }

  const math = extractLatexFromElement(node);
  if (math) {
    return math.display ? `\n\n$$${math.latex}$$\n\n` : `$${math.latex}$`;
  }

  const tag = node.tagName.toUpperCase();
  if (shouldSkipElement(node, tag)) {
    return "";
  }

  if (tag === "BR") return "\n";

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `\n\n${"#".repeat(level)} ${childrenToMarkdown(node).trim()}\n\n`;
  }

  if (tag === "PRE") {
    const text = extractPreformattedText(node);
    const latex = extractLatexSourceText(text);
    return latex ? `\n\n$$${latex}$$\n\n` : `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
  }

  if (tag === "CODE") {
    const text = node.textContent?.trim() ?? "";
    return text.includes("\n") ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : `\`${text}\``;
  }

  if (tag === "A") {
    const text = childrenToMarkdown(node).trim() || node.getAttribute("href") || "";
    const href = node.getAttribute("href");
    return href ? `[${text}](${href})` : text;
  }

  if (tag === "IMG") {
    const alt = node.getAttribute("alt") || "图片";
    const src = node.getAttribute("src") || "";
    return src ? `![${alt}](${src})` : alt;
  }

  if (tag === "UL" || tag === "OL") {
    const ordered = tag === "OL";
    return (
      "\n" +
      Array.from(node.children)
        .filter((child) => child.tagName.toUpperCase() === "LI")
        .map((child, index) => {
          const prefix = ordered ? `${index + 1}. ` : "- ";
          return prefix + childrenToMarkdown(child).trim().replace(/\n+/g, "\n  ");
        })
        .join("\n") +
      "\n"
    );
  }

  if (tag === "TABLE") {
    return renderTable(node);
  }

  if (tag === "BLOCKQUOTE") {
    return (
      "\n\n" +
      childrenToMarkdown(node)
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n") +
      "\n\n"
    );
  }

  const rendered = childrenToMarkdown(node);
  if (BLOCK_TAGS.has(tag)) return `\n${rendered}\n`;
  return rendered;
}

function childrenToMarkdown(element: Element): string {
  return Array.from(element.childNodes)
    .map((child) => renderNode(child))
    .join("");
}

function extractLatexFromElement(element: Element): { latex: string; display: boolean } | undefined {
  const tag = element.tagName.toUpperCase();
  const type = element.getAttribute("type") || "";
  if (tag === "SCRIPT" && /math\/tex/i.test(type)) {
    return {
      latex: normalizeLatex(element.textContent || ""),
      display: /mode=display/i.test(type)
    };
  }

  const dataMath = element.getAttribute("data-math") || element.getAttribute("data-latex") || element.getAttribute("data-tex");
  if (dataMath) {
    return {
      latex: normalizeLatex(dataMath),
      display: isDisplayMath(element)
    };
  }

  if (element.matches("annotation[encoding='application/x-tex']")) {
    return {
      latex: normalizeLatex(element.textContent || ""),
      display: isDisplayMath(element)
    };
  }

  const className = element.className?.toString() ?? "";
  if (/\bkatex\b|MathJax|mjx-container/i.test(className) || tag === "MJX-CONTAINER") {
    const annotation = element.querySelector("annotation[encoding='application/x-tex']");
    const script = element.querySelector("script[type*='math/tex']");
    const latex = normalizeLatex(annotation?.textContent || script?.textContent || element.getAttribute("aria-label") || "");
    if (latex) {
      return {
        latex,
        display: isDisplayMath(element)
      };
    }
  }

  return undefined;
}

function isDisplayMath(element: Element): boolean {
  const className = element.className?.toString() ?? "";
  return (
    /\bkatex-display\b|display/i.test(className) ||
    element.getAttribute("display") === "true" ||
    element.closest(".katex-display, [display='true']") !== null
  );
}

function shouldSkipElement(element: Element, tag: string): boolean {
  if (SKIP_TAGS.has(tag)) return true;
  const className = element.className?.toString() ?? "";
  if (SKIP_CLASS_PARTS.some((part) => className.includes(part))) return true;
  const testId = element.getAttribute("data-test-id") || element.getAttribute("data-testid") || "";
  if (/(copy|share|download|more|menu|feedback|thumb|toolbar|action|disclaimer|textarea|input)/i.test(testId)) return true;
  const ariaLabel = element.getAttribute("aria-label") || "";
  if (/(复制|分享|下载|更多|菜单|赞|踩|编辑|重做|麦克风|上传|工具|copy|share|download|more|menu|edit|retry|microphone|upload)/i.test(ariaLabel)) {
    return true;
  }
  if (element.getAttribute("aria-hidden") === "true" && element.closest(".katex, mjx-container")) return true;
  return false;
}

function renderTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) => normalizeWhitespace(elementToMarkdown(cell)))
  );

  if (rows.length === 0 || rows[0].length === 0) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const paddedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
  const header = paddedRows[0];
  const separator = Array.from({ length: columnCount }, () => "---");
  const body = paddedRows.slice(1);

  return (
    "\n\n" +
    [header, separator, ...body]
      .map((row) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`)
      .join("\n") +
    "\n\n"
  );
}

function extractPreformattedText(element: Element): string {
  const codeElement = element.querySelector("pre code, code") ?? element;
  const text = textWithLineBreaks(codeElement)
    .replace(/^\s*(复制|运行|Copy|Run)\s*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || element.textContent?.trim() || "";
}

function textWithLineBreaks(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";

  const tag = node.tagName.toUpperCase();
  if (shouldSkipElement(node, tag)) return "";
  if (tag === "BR") return "\n";

  const content = Array.from(node.childNodes)
    .map((child) => textWithLineBreaks(child))
    .join("");

  if (tag === "DIV" || tag === "P") return `${content}\n`;
  return content;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeAdjacentMathBlocks(markdown: string): string {
  const blocks = normalizeMarkdownText(markdown).split(/\n{2,}/);
  const deduped: string[] = [];
  let previousMathKey: string | undefined;

  for (const block of blocks) {
    const trimmed = block.trim();
    const latex = extractDisplayMathBlock(trimmed);
    const mathKey = latex ? normalizeLatexKey(latex) : undefined;

    if (mathKey && mathKey === previousMathKey) {
      continue;
    }

    deduped.push(trimmed);
    previousMathKey = mathKey;
  }

  return normalizeMarkdownText(deduped.join("\n\n"));
}

function extractDisplayMathBlock(block: string): string | undefined {
  const trimmed = block.trim();
  if (!trimmed.startsWith("$$") || !trimmed.endsWith("$$")) return undefined;
  return normalizeLatex(trimmed.slice(2, -2));
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function countLikelyMessages(): number {
  return Array.from(document.querySelectorAll(MESSAGE_SELECTOR)).filter(isLikelyMessageElement).length;
}

function findBestScrollContainer(): Element | Window {
  const candidates = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    ...Array.from(document.querySelectorAll("main, [role='main'], [class*='scroll'], [class*='conversation'], [data-radix-scroll-area-viewport]"))
  ].filter((element): element is Element => Boolean(element));

  const scrollable = candidates
    .map((element) => ({
      element,
      score: Math.max(0, element.scrollHeight - element.clientHeight) + element.querySelectorAll(MESSAGE_SELECTOR).length * 80
    }))
    .sort((a, b) => b.score - a.score);

  return scrollable[0]?.score > 0 ? scrollable[0].element : window;
}

function getScrollTop(scroller: Element | Window): number {
  return scroller === window ? window.scrollY : (scroller as Element).scrollTop;
}

function getScrollHeight(scroller: Element | Window): number {
  return scroller === window ? document.documentElement.scrollHeight : (scroller as Element).scrollHeight;
}

function scrollToTop(scroller: Element | Window): void {
  if (scroller === window) {
    window.scrollTo({ top: 0, behavior: "auto" });
  } else {
    (scroller as Element).scrollTop = 0;
  }
}

function restoreOriginalPosition(scroller: Element | Window, top: number): void {
  if (scroller === window) {
    window.scrollTo({ top, behavior: "auto" });
  } else {
    (scroller as Element).scrollTop = top;
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("加载已取消", "AbortError"));
      },
      { once: true }
    );
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("加载已取消", "AbortError");
  }
}
