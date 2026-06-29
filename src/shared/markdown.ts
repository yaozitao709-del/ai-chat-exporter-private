import type { ContentBlock, Conversation, ExportOptions, Message } from "./types";

const ROLE_LABELS: Record<Message["role"], string> = {
  user: "我",
  assistant: "AI",
  system: "系统"
};

export function normalizeMarkdownText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function selectedMessages(conversation: Conversation): Message[] {
  return conversation.messages.filter((message) => message.selected && message.contentMarkdown.trim());
}

export function conversationToMarkdown(conversation: Conversation, options?: Pick<ExportOptions, "layoutMode">): string {
  if (options?.layoutMode === "polished") {
    return conversationToPolishedMarkdown(conversation);
  }

  const messages = selectedMessages(conversation);
  const chunks = [
    `# ${conversation.title || "AI 对话导出"}`,
    "",
    `- 来源：${providerLabel(conversation.provider)}`,
    `- 链接：${conversation.url}`,
    `- 导出时间：${new Date(conversation.extractedAt).toLocaleString()}`
  ];

  if (conversation.warning) {
    chunks.push(`- 提示：${conversation.warning}`);
  }

  for (const [index, message] of messages.entries()) {
    chunks.push("", `## ${index + 1}. ${ROLE_LABELS[message.role]}`, "", normalizeMarkdownText(message.contentMarkdown));
  }

  return chunks.join("\n").trim() + "\n";
}

export function cleanMarkdownForPolishedExport(markdown: string): string {
  const lines = normalizeMarkdownText(markdown).split(/\r?\n/);
  let inFence = false;

  const cleaned = lines.map((line) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      return line;
    }

    return inFence ? line : cleanNonCodeMarkdownLine(line);
  });

  return normalizeMarkdownText(cleaned.join("\n"));
}

export function markdownToBlocks(markdown: string): ContentBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ContentBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const language = line.trim().replace(/^```/, "").trim() || undefined;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", language, code: code.join("\n") });
      index += 1;
      continue;
    }

    const table = readMarkdownTable(lines, index);
    if (table) {
      blocks.push({ type: "table", rows: table.rows });
      index += table.consumed;
      continue;
    }

    const displayMathBlock = readDisplayMathBlock(lines, index);
    if (displayMathBlock) {
      blocks.push({ type: "math", latex: displayMathBlock.latex, display: true });
      index += displayMathBlock.consumed;
      continue;
    }

    const displayMath = /^\$\$([\s\S]+)\$\$$/.exec(line.trim());
    if (displayMath) {
      blocks.push({ type: "math", latex: displayMath[1].trim(), display: true });
      index += 1;
      continue;
    }

    const listItems: string[] = [];
    const ordered = /^\d+\.\s+/.test(line);
    while (index < lines.length) {
      const item = ordered ? /^\d+\.\s+(.+)$/.exec(lines[index] ?? "") : /^[-*]\s+(.+)$/.exec(lines[index] ?? "");
      if (!item) break;
      listItems.push(item[1].trim());
      index += 1;
    }
    if (listItems.length > 0) {
      blocks.push({ type: "list", ordered, items: listItems });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]?.trim() && !startsSpecialBlock(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function providerLabel(provider: Conversation["provider"]): string {
  switch (provider) {
    case "deepseek":
      return "DeepSeek";
    case "chatgpt":
      return "ChatGPT";
    case "gemini":
      return "Gemini";
    case "doubao":
      return "豆包";
    default:
      return "未知平台";
  }
}

export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || `ai-chat-${new Date().toISOString().slice(0, 10)}`;
}

function startsSpecialBlock(line: string): boolean {
  return /^(#{1,6})\s+/.test(line) || /^```/.test(line.trim()) || /^\$\$/.test(line.trim()) || /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || line.includes("|");
}

function conversationToPolishedMarkdown(conversation: Conversation): string {
  const messages = selectedMessages(conversation);
  const chunks: string[] = [];

  for (const message of messages) {
    const roleLabel = polishedRoleLabel(conversation, message);
    const content = demoteMarkdownHeadings(cleanMarkdownForPolishedExport(message.contentMarkdown));

    if (!content) continue;

    chunks.push(`## ${roleLabel}：`, "", content, "");
  }

  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function polishedRoleLabel(conversation: Conversation, message: Message): string {
  if (message.role === "assistant") return providerLabel(conversation.provider);
  return ROLE_LABELS[message.role] ?? "内容";
}

function demoteMarkdownHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,6})\s+/gm, (_match, hashes: string) => `${"#".repeat(Math.min(6, hashes.length + 2))} `);
}

function cleanNonCodeMarkdownLine(line: string): string {
  let next = line
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => `[${cleanLinkLabel(label)}](${href})`);

  for (let index = 0; index < 4; index += 1) {
    next = next.replace(/\[([^\]\n]+)]\(((?:https?:\/\/|mailto:|\/)[^)]+)\)/g, (_match, label: string, href: string) => {
      const cleanedLabel = cleanLinkLabel(label);
      return cleanedLabel ? `[${cleanedLabel}](${href})` : "";
    });
  }

  return next
    .replace(/\[\s*]\([^)]+\)/g, "")
    .replace(/(?<!\]\()\bhttps?:\/\/\S+/gi, "")
    .replace(/(?<!\]\()\bwww\.\S+/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([，。；：,.!?])/g, "$1")
    .trimEnd();
}

function cleanLinkLabel(label: string): string {
  return label
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/^\s*图片\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readMarkdownTable(lines: string[], start: number): { rows: string[][]; consumed: number } | undefined {
  const headerLine = lines[start];
  const separatorLine = lines[start + 1];
  if (!headerLine?.includes("|") || !/^\s*\|?[\s:-]+\|[\s|:-]+\s*$/.test(separatorLine ?? "")) return undefined;

  const rows = [splitTableRow(headerLine)];
  let index = start + 2;
  while (index < lines.length && lines[index]?.includes("|")) {
    rows.push(splitTableRow(lines[index] ?? ""));
    index += 1;
  }

  return { rows, consumed: index - start };
}

function readDisplayMathBlock(lines: string[], start: number): { latex: string; consumed: number } | undefined {
  const firstLine = lines[start]?.trim();
  if (!firstLine?.startsWith("$$")) return undefined;

  if (firstLine.endsWith("$$") && firstLine.length > 2) {
    return {
      latex: firstLine.slice(2, -2).trim(),
      consumed: 1
    };
  }

  const latexLines = [firstLine.slice(2)];
  let index = start + 1;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const end = line.indexOf("$$");
    if (end >= 0) {
      latexLines.push(line.slice(0, end));
      return {
        latex: latexLines.join("\n").trim(),
        consumed: index - start + 1
      };
    }

    latexLines.push(line);
    index += 1;
  }

  return undefined;
}

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}
