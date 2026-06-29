import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import katex from "katex";
import { marked } from "marked";
import { normalizeLatexForConverter } from "../shared/latex";
import { conversationToMarkdown } from "../shared/markdown";
import type { Conversation, ExportOptions } from "../shared/types";
import { withExtension } from "./download";

const PDF_CSS_PAGE_WIDTH = 794;
const PDF_CSS_PAGE_HEIGHT = 1123;
const PDF_CSS_TOP_MARGIN = 54;
const PDF_CSS_BOTTOM_MARGIN = 72;

export async function exportPdf(conversation: Conversation, options: ExportOptions): Promise<void> {
  const markdown = conversationToMarkdown(conversation, options);
  if (options.format === "pdf-print") {
    await exportPrintablePdf(markdown, conversation, options);
    return;
  }

  const root = createPdfRoot(marked.parse(protectDisplayMathBlocks(markdown), { async: false }) as string);

  document.body.append(root);

  try {
    renderProtectedMathBlocks(root);
    renderMathInElement(root);
    await waitForLayout();
    insertPageBreakSpacers(root);
    await waitForLayout();

    const canvas = await html2canvas(root, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
      windowWidth: root.scrollWidth,
      windowHeight: root.scrollHeight
    });

    saveCanvasAsPdf(canvas, options.fileName);
  } finally {
    root.remove();
  }
}

async function exportPrintablePdf(markdown: string, conversation: Conversation, options: ExportOptions): Promise<void> {
  const renderedHtml = renderMarkdownToHtml(markdown);
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error("浏览器拦截了打印窗口，请允许弹出窗口后重试。");
  }

  printWindow.document.open();
  printWindow.document.write(printableHtml(renderedHtml, conversation.title || options.fileName));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // Some browsers only allow print from a direct click in the print tab.
    }
  }, 700);
}

function renderMarkdownToHtml(markdown: string): string {
  const scratch = document.createElement("div");
  scratch.innerHTML = marked.parse(protectDisplayMathBlocks(markdown), { async: false }) as string;
  renderProtectedMathBlocks(scratch);
  renderMathInElement(scratch);
  return scratch.innerHTML;
}

function createPdfRoot(content: string): HTMLDivElement {
  const root = document.createElement("div");
  root.setAttribute("data-ai-chat-pdf-root", "true");
  root.innerHTML = content;
  root.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    z-index: -2147483647;
    width: ${PDF_CSS_PAGE_WIDTH}px;
    min-height: ${PDF_CSS_PAGE_HEIGHT}px;
    padding: ${PDF_CSS_TOP_MARGIN}px 60px ${PDF_CSS_BOTTOM_MARGIN}px;
    box-sizing: border-box;
    background: #ffffff;
    color: #111827;
    font-family: "Times New Roman", "Songti SC", "SimSun", "PingFang SC", serif;
    font-size: 14px;
    line-height: 1.74;
    overflow-wrap: anywhere;
    word-break: break-word;
    pointer-events: none;
  `;

  const style = document.createElement("style");
  style.textContent = `
    [data-ai-chat-pdf-root] * { box-sizing: border-box; max-width: 100%; }
    [data-ai-chat-pdf-root] h1 { break-after: avoid; page-break-after: avoid; font-size: 26px; margin: 0 0 24px; font-weight: 700; }
    [data-ai-chat-pdf-root] h2 { break-after: avoid; page-break-after: avoid; font-size: 20px; margin: 28px 0 14px; font-weight: 700; }
    [data-ai-chat-pdf-root] h3 { break-after: avoid; page-break-after: avoid; font-size: 17px; margin: 22px 0 10px; font-weight: 700; }
    [data-ai-chat-pdf-root] h4, [data-ai-chat-pdf-root] h5, [data-ai-chat-pdf-root] h6 { break-after: avoid; page-break-after: avoid; margin: 18px 0 8px; font-weight: 700; }
    [data-ai-chat-pdf-root] h1, [data-ai-chat-pdf-root] h2, [data-ai-chat-pdf-root] h3, [data-ai-chat-pdf-root] h4, [data-ai-chat-pdf-root] h5, [data-ai-chat-pdf-root] h6,
    [data-ai-chat-pdf-root] p, [data-ai-chat-pdf-root] li, [data-ai-chat-pdf-root] blockquote,
    [data-ai-chat-pdf-root] th, [data-ai-chat-pdf-root] td, [data-ai-chat-pdf-root] code {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    [data-ai-chat-pdf-root] p { margin: 0 0 11px; }
    [data-ai-chat-pdf-root] ul, [data-ai-chat-pdf-root] ol { margin: 6px 0 12px 28px; padding: 0; }
    [data-ai-chat-pdf-root] li { margin: 2px 0; padding-left: 2px; }
    [data-ai-chat-pdf-root] pre { break-inside: avoid; page-break-inside: avoid; max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; background: #f6f8fa; border: 1px solid #d9dee7; border-radius: 4px; padding: 12px; margin: 13px 0; line-height: 1.55; }
    [data-ai-chat-pdf-root] code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 0.9em; background: #eef0f3; padding: 1px 3px; border-radius: 3px; }
    [data-ai-chat-pdf-root] pre code { background: transparent; padding: 0; border-radius: 0; }
    [data-ai-chat-pdf-root] table { break-inside: avoid; page-break-inside: avoid; border-collapse: collapse; width: 100%; margin: 14px 0 18px; table-layout: fixed; }
    [data-ai-chat-pdf-root] th, [data-ai-chat-pdf-root] td { border: 1px solid #9ca3af; padding: 7px 8px; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }
    [data-ai-chat-pdf-root] th { font-weight: 700; background: #f8fafc; text-align: center; }
    [data-ai-chat-pdf-root] blockquote { break-inside: avoid; page-break-inside: avoid; margin: 12px 0 14px; padding: 2px 0 2px 14px; border-left: 3px solid #d1d5db; background: transparent; }
    [data-ai-chat-pdf-root] blockquote p { margin-bottom: 8px; }
    [data-ai-chat-pdf-root] .math-block { display: block; margin: 16px 0; text-align: center; break-inside: avoid; page-break-inside: avoid; overflow-wrap: anywhere; }
    [data-ai-chat-pdf-root] .math-inline { display: inline-block; vertical-align: middle; }
    [data-ai-chat-pdf-root] [data-ai-chat-display-math] { white-space: normal; }
    [data-ai-chat-page-spacer] { display: block; width: 100%; margin: 0; padding: 0; border: 0; }
  `;
  root.prepend(style);

  return root;
}

function printableHtml(content: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 72pt 72pt 54pt; }
      html, body { color: #111; }
      html { background: #f3f4f6; }
      body {
        margin: 0;
        font-family: "Times New Roman", "Songti SC", "SimSun", "PingFang SC", serif;
        font-size: 12pt;
        line-height: 1.65;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      * { box-sizing: border-box; max-width: 100%; }
      .print-toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-height: 54px;
        padding: 10px 18px;
        border-bottom: 1px solid #d1d5db;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
        font-size: 13px;
      }
      .print-toolbar strong { font-size: 14px; }
      .print-toolbar button {
        height: 34px;
        border: 0;
        border-radius: 6px;
        background: #2563eb;
        color: #fff;
        padding: 0 14px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .print-toolbar button:hover { background: #1d4ed8; }
      .print-toolbar span { color: #6b7280; }
      .print-document {
        background: #fff;
        max-width: 451pt;
        min-height: 716pt;
        margin: 32pt auto;
        padding: 72pt;
        box-shadow: 0 0 0 1px #e5e7eb, 0 18px 42px rgba(15, 23, 42, 0.08);
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; font-weight: 700; line-height: 1.35; }
      h1, h2, h3, h4, h5, h6, p, li, th, td, blockquote, code {
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      h1 { font-size: 20pt; margin: 0 0 18pt; }
      h2 { font-size: 16pt; margin: 22pt 0 12pt; }
      h3 { font-size: 14pt; margin: 18pt 0 8pt; }
      p { margin: 0 0 8pt; }
      ul, ol { margin: 4pt 0 10pt 24pt; padding: 0; }
      li { margin: 2pt 0; }
      table { width: 100%; border-collapse: collapse; margin: 10pt 0 14pt; page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      th, td { border: 0.75pt solid #111; padding: 5pt 6pt; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }
      th { font-weight: 700; text-align: center; }
      pre { max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; font-family: "SFMono-Regular", Consolas, monospace; font-size: 10.5pt; line-height: 1.45; margin: 10pt 0; page-break-inside: avoid; }
      code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.92em; }
      blockquote { margin: 8pt 0 10pt 18pt; padding-left: 10pt; border-left: 2.5pt solid #d1d5db; page-break-inside: avoid; }
      a { color: #0563c1; text-decoration: underline; }
      .math-block { display: block; text-align: center; margin: 10pt 0; page-break-inside: avoid; }
      .math-inline { display: inline-block; vertical-align: middle; }
      @media screen {
        body { padding-bottom: 32pt; }
      }
      @media print {
        html, body { background: #fff; }
        .print-toolbar { display: none !important; }
        .print-document {
          max-width: none;
          min-height: 0;
          margin: 0;
          padding: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-toolbar">
      <strong>PDF 打印版</strong>
      <button id="aice-print-button" type="button">打印 / 存储为 PDF</button>
      <span>如果没有自动弹出打印窗口，请点这个按钮。</span>
    </div>
    <main class="print-document">
      ${content}
    </main>
    <script>
      function aicePrint() {
        window.focus();
        window.print();
      }
      document.getElementById("aice-print-button")?.addEventListener("click", aicePrint);
      window.addEventListener("DOMContentLoaded", () => setTimeout(aicePrint, 500));
      window.addEventListener("load", () => setTimeout(aicePrint, 900));
    </script>
  </body>
</html>`;
}

function protectDisplayMathBlocks(markdown: string): string {
  return markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_match, latex: string) => {
    const encoded = encodeURIComponent(latex.trim());
    return `\n\n<div class="math-block" data-ai-chat-display-math="${encoded}"></div>\n\n`;
  });
}

function renderProtectedMathBlocks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-ai-chat-display-math]").forEach((element) => {
    const latex = decodeURIComponent(element.dataset.aiChatDisplayMath ?? "");
    renderLatexIntoElement(element, latex, true, `$$${latex}$$`);
  });
}

function renderMathInElement(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("pre, code, script, style")) return NodeFilter.FILTER_REJECT;
      return /\$[^$]+\$/.test(node.textContent ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    replaceMathTextNode(node);
  }
}

function insertPageBreakSpacers(root: HTMLElement): void {
  root.querySelectorAll("[data-ai-chat-page-spacer]").forEach((spacer) => spacer.remove());

  const contentHeight = PDF_CSS_PAGE_HEIGHT - PDF_CSS_TOP_MARGIN - PDF_CSS_BOTTOM_MARGIN;
  const blocks = Array.from(root.children).filter((element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.tagName === "STYLE" || element.dataset.aiChatPageSpacer === "true") return false;
    return true;
  }) as HTMLElement[];

  for (const block of blocks) {
    const top = block.offsetTop;
    const height = block.offsetHeight;
    if (height <= 0 || height > contentHeight) continue;

    const pageIndex = Math.floor(top / PDF_CSS_PAGE_HEIGHT);
    const pageBottom = pageIndex * PDF_CSS_PAGE_HEIGHT + PDF_CSS_PAGE_HEIGHT - PDF_CSS_BOTTOM_MARGIN;
    if (top + height <= pageBottom) continue;

    const nextPageContentTop = (pageIndex + 1) * PDF_CSS_PAGE_HEIGHT + PDF_CSS_TOP_MARGIN;
    const spacerHeight = Math.max(0, nextPageContentTop - top);
    if (spacerHeight <= 0) continue;

    const spacer = document.createElement("div");
    spacer.dataset.aiChatPageSpacer = "true";
    spacer.style.height = `${spacerHeight}px`;
    block.before(spacer);
  }
}

function replaceMathTextNode(node: Text): void {
  const text = node.textContent ?? "";
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  if (parts.length === 1) return;

  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (!part) continue;
    const display = part.startsWith("$$");
    const inline = part.startsWith("$") && !display;

    if (!display && !inline) {
      fragment.append(document.createTextNode(part));
      continue;
    }

    const latex = display ? part.slice(2, -2).trim() : part.slice(1, -1).trim();
    const wrapper = document.createElement(display ? "div" : "span");
    wrapper.className = display ? "math-block" : "math-inline";
    try {
      renderLatexIntoElement(wrapper, latex, display, part);
    } catch {
      wrapper.textContent = part;
    }
    fragment.append(wrapper);
  }

  node.replaceWith(fragment);
}

function renderLatexIntoElement(element: HTMLElement, latex: string, display: boolean, fallback: string): void {
  try {
    element.innerHTML = katex.renderToString(normalizeLatexForPdf(latex), {
      displayMode: display,
      output: "mathml",
      throwOnError: false
    });
  } catch {
    element.textContent = fallback;
  }
}

function normalizeLatexForPdf(latex: string): string {
  return normalizeLatexForConverter(latex);
}

function saveCanvasAsPdf(canvas: HTMLCanvasElement, fileName: string): void {
  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
    compress: true
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const sliceHeight = Math.floor((canvas.width * pageHeight) / pageWidth);
  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const currentSliceHeight = Math.min(sliceHeight, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSliceHeight;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 PDF 分页画布");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, currentSliceHeight, 0, 0, canvas.width, currentSliceHeight);

    if (pageIndex > 0) pdf.addPage();
    const imageHeight = (currentSliceHeight * pageWidth) / canvas.width;
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageWidth, imageHeight);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(String(pageIndex + 1), pageWidth / 2, pageHeight - 18, { align: "center" });

    sourceY += currentSliceHeight;
    pageIndex += 1;
  }

  pdf.save(withExtension(fileName || "ai-chat-export", "pdf"));
}

function waitForLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
