import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HighlightColor,
  HeadingLevel,
  LevelFormat,
  Packer,
  type ParagraphChild,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType
} from "docx";
import katex from "katex";
import { normalizeLatexForConverter } from "../shared/latex";
import { conversationToMarkdown } from "../shared/markdown";
import type { Conversation, ExportOptions, WordTemplate } from "../shared/types";
import { downloadBlob, withExtension } from "./download";
import { mathMlToDocxMath } from "./math";

const DOCX_CONTENT_WIDTH = 9360;
const CODE_FONT = {
  ascii: "Courier New",
  hAnsi: "Courier New",
  cs: "Courier New",
  eastAsia: "SimSun"
};

interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

interface QuoteLine {
  level: number;
  content: string;
}

interface InlineOptions {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  underline?: boolean;
  strike?: boolean;
  highlight?: boolean;
  subScript?: boolean;
  superScript?: boolean;
  color?: string;
}

export async function exportDocx(conversation: Conversation, options: ExportOptions): Promise<void> {
  const markdown = conversationToMarkdown(conversation, options);
  const polished = options.layoutMode === "polished";
  const children = markdownToDocxBlocks(markdown, options.template, polished);
  const document = new Document({
    creator: polished ? "" : "AI Chat Exporter Private",
    title: conversation.title,
    description: polished ? "" : "Local export from an AI chat page",
    numbering: {
      config: [
        {
          reference: "aice-bullet-list",
          levels: listLevels(LevelFormat.BULLET, ["•", "◦", "▪", "•", "◦", "▪"])
        },
        {
          reference: "aice-number-list",
          levels: listLevels(LevelFormat.DECIMAL, ["%1.", "%2.", "%3.", "%4.", "%5.", "%6."])
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: polished
              ? {
                  width: 12240,
                  height: 15840
                }
              : undefined,
            margin: {
              top: polished ? 1440 : 1134,
              right: polished ? 1803 : 1134,
              bottom: polished ? 1440 : 1134,
              left: polished ? 1803 : 1134,
              footer: polished ? 720 : undefined
            }
          }
        },
        footers: polished ? { default: pageNumberFooter() } : undefined,
        children
      }
    ]
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, withExtension(options.fileName, "docx"));
}

function markdownToDocxBlocks(markdown: string, template: WordTemplate, polished = false): Array<Paragraph | Table> {
  const lines = markdown.split(/\r?\n/);
  const blocks: Array<Paragraph | Table> = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(headingParagraph(heading[2], heading[1].length, template, polished));
      index += 1;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(codeBlockTable(codeLines.join("\n"), polished));
      continue;
    }

    const displayMathBlock = readDisplayMathBlock(lines, index);
    if (displayMathBlock) {
      blocks.push(mathParagraph(displayMathBlock.latex));
      index += displayMathBlock.consumed;
      continue;
    }

    const displayMath = /^\$\$([\s\S]+)\$\$$/.exec(line.trim());
    if (displayMath) {
      blocks.push(mathParagraph(displayMath[1]));
      index += 1;
      continue;
    }

    const quoteBlock = readQuoteBlock(lines, index);
    if (quoteBlock) {
      blocks.push(quoteBlockTable(quoteBlock.lines, polished));
      index += quoteBlock.consumed;
      continue;
    }

    const table = readMarkdownTable(lines, index);
    if (table) {
      blocks.push(tableToDocx(table, polished));
      index += table.rows.length + 2;
      continue;
    }

    const listItem = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listItem) {
      const level = Math.min(5, Math.floor(listItem[1].replace(/\t/g, "  ").length / 2));
      const ordered = /^\d+\./.test(listItem[2]);
      blocks.push(
        new Paragraph({
          numbering: {
            reference: ordered ? "aice-number-list" : "aice-bullet-list",
            level
          },
          spacing: { after: polished ? 70 : 120, line: polished ? 330 : undefined },
          children: inlineChildren(listItem[3], { size: polished ? 22 : undefined })
        })
      );
      index += 1;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]?.trim() && !isSpecialMarkdownStart(lines[index] ?? "")) {
      paragraphLines.push((lines[index] ?? "").trim());
      index += 1;
    }

    blocks.push(
      new Paragraph({
        spacing: { after: polished ? 120 : 160, line: polished ? 330 : undefined },
        children: inlineChildren(paragraphLines.join(" "), { size: polished ? 22 : undefined })
      })
    );
  }

  return blocks;
}

function pageNumberFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: " ",
            color: "6B7280",
            size: 18
          })
        ]
      })
    ]
  });
}

function listLevels(format: (typeof LevelFormat)[keyof typeof LevelFormat], markers: string[]) {
  return Array.from({ length: 6 }, (_unused, level) => ({
    level,
    format,
    text: markers[level] ?? markers[0],
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: {
          left: 360 + level * 360,
          hanging: 240
        }
      }
    }
  }));
}

function headingParagraph(text: string, level: number, template: WordTemplate, polished: boolean): Paragraph {
  if (polished && /^.+：$/.test(text.trim())) {
    return new Paragraph({
      spacing: { before: 260, after: 140 },
      keepNext: true,
      children: [
        new TextRun({
          text,
          bold: true,
          color: "111827",
          size: 28
        })
      ]
    });
  }

  const heading = level === 1 ? HeadingLevel.TITLE : level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
  const color = template === "academic" ? "111827" : template === "report" ? "1D4ED8" : "182235";

  return new Paragraph({
    heading,
    spacing: { before: polished ? 240 : level === 1 ? 0 : 280, after: polished ? 110 : 180 },
    alignment: polished ? AlignmentType.LEFT : level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        bold: true,
        color,
        size: polished ? (level <= 3 ? 25 : 23) : level === 1 ? 36 : level === 2 ? 28 : 24
      })
    ]
  });
}

function codeBlockTable(code: string, polished: boolean): Table {
  const lines = (code || " ").split(/\r?\n/);
  const children = lines.map(
    (line) =>
      new Paragraph({
        spacing: { before: 0, after: 0, line: polished ? 250 : 280 },
        children: [
          new TextRun({
            text: decodeHtmlEntities(line || " "),
            font: CODE_FONT,
            size: polished ? 18 : 20
          })
        ]
      })
  );

  return new Table({
    width: {
      size: DOCX_CONTENT_WIDTH,
      type: WidthType.DXA
    },
    columnWidths: [DOCX_CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: subtleTableBorders("D7DEE8"),
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            margins: {
              top: 160,
              bottom: 160,
              left: 180,
              right: 180
            },
            shading: {
              type: ShadingType.CLEAR,
              fill: "F6F8FA"
            },
            children
          })
        ]
      })
    ]
  });
}

function quoteBlockTable(lines: QuoteLine[], polished: boolean): Table {
  const children: Paragraph[] = [];
  let previousWasBlank = false;

  for (const line of lines) {
    if (!line.content.trim()) {
      if (!previousWasBlank && children.length > 0) {
        children.push(quoteSpacerParagraph(polished));
      }
      previousWasBlank = true;
      continue;
    }

    children.push(quoteContentParagraph(line, polished));
    previousWasBlank = false;
  }

  if (children.length === 0) {
    children.push(quoteSpacerParagraph(polished));
  }

  return new Table({
    width: {
      size: DOCX_CONTENT_WIDTH,
      type: WidthType.DXA
    },
    columnWidths: [DOCX_CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: quoteCellBorders(),
            margins: {
              top: polished ? 90 : 110,
              bottom: polished ? 90 : 110,
              left: 240,
              right: 180
            },
            children
          })
        ]
      })
    ]
  });
}

function quoteContentParagraph(line: QuoteLine, polished: boolean): Paragraph {
  const listItem = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line.content);
  const nestedIndent = line.level * 360;
  const border =
    line.level > 0
      ? {
          left: {
            color: "D1D5DB",
            space: 8,
            style: BorderStyle.SINGLE,
            size: 10
          }
        }
      : undefined;

  if (listItem) {
    const extraLevel = Math.floor(listItem[1].replace(/\t/g, "  ").length / 2);
    const level = Math.min(5, line.level + extraLevel);
    const ordered = /^\d+\./.test(listItem[2]);
    return new Paragraph({
      numbering: {
        reference: ordered ? "aice-number-list" : "aice-bullet-list",
        level
      },
      border,
      indent: line.level > 0 ? { left: nestedIndent } : undefined,
      spacing: { after: polished ? 70 : 100, line: polished ? 310 : undefined },
      children: inlineChildren(listItem[3], { size: polished ? 22 : undefined })
    });
  }

  return new Paragraph({
    border,
    indent: nestedIndent > 0 ? { left: nestedIndent } : undefined,
    spacing: { after: polished ? 85 : 110, line: polished ? 320 : undefined },
    children: inlineChildren(line.content, { size: polished ? 22 : undefined })
  });
}

function quoteSpacerParagraph(polished: boolean): Paragraph {
  return new Paragraph({
    spacing: { after: polished ? 55 : 75, line: polished ? 120 : 140 },
    children: [
      new TextRun({
        text: " ",
        size: 4
      })
    ]
  });
}

function mathParagraph(latex: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 180 },
    children: [latexToMathChild(latex, true)]
  });
}

function readQuoteBlock(lines: string[], start: number): { lines: QuoteLine[]; consumed: number } | undefined {
  const quoteLines: QuoteLine[] = [];
  let index = start;

  while (index < lines.length) {
    const parsed = parseQuoteLine(lines[index] ?? "");
    if (!parsed) break;
    quoteLines.push(parsed);
    index += 1;
  }

  if (quoteLines.length === 0) return undefined;
  return {
    lines: quoteLines,
    consumed: index - start
  };
}

function parseQuoteLine(line: string): QuoteLine | undefined {
  let rest = line.trimStart();
  let level = 0;

  while (rest.startsWith(">")) {
    level += 1;
    rest = rest.slice(1);
    if (rest.startsWith(" ")) rest = rest.slice(1);
  }

  if (level === 0) return undefined;
  return {
    level: Math.min(5, level - 1),
    content: rest
  };
}

function readMarkdownTable(lines: string[], start: number): MarkdownTable | undefined {
  const headerLine = lines[start];
  const separatorLine = lines[start + 1];
  if (!headerLine?.includes("|") || !/^\s*\|?[\s:-]+\|[\s|:-]+\s*$/.test(separatorLine ?? "")) return undefined;

  const headers = splitTableRow(headerLine);
  const rows: string[][] = [];
  let index = start + 2;

  while (index < lines.length && lines[index]?.includes("|")) {
    rows.push(splitTableRow(lines[index] ?? ""));
    index += 1;
  }

  return { headers, rows };
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

function tableToDocx(table: MarkdownTable, polished: boolean): Table {
  const columnCount = Math.max(table.headers.length, ...table.rows.map((row) => row.length), 1);
  const columnWidths = calculateColumnWidths(table, columnCount);
  const rows = [table.headers, ...table.rows].map(
    (cells, rowIndex) =>
      new TableRow({
        tableHeader: rowIndex === 0,
        cantSplit: true,
        children: Array.from({ length: columnCount }, (_unused, cellIndex) => cells[cellIndex] ?? "").map(
          (cell, cellIndex) =>
            new TableCell({
              margins: {
                top: polished ? 130 : 120,
                bottom: polished ? 130 : 120,
                left: polished ? 150 : 140,
                right: polished ? 150 : 140
              },
              verticalAlign: VerticalAlignTable.CENTER,
              width: {
                size: columnWidths[cellIndex],
                type: WidthType.DXA
              },
              shading:
                rowIndex === 0
                  ? {
                      type: ShadingType.CLEAR,
                      fill: "EFF6FF"
                    }
                  : undefined,
              children: [
                new Paragraph({
                  spacing: { after: 40, line: polished ? 280 : undefined },
                  alignment: cellAlignment(cell, cellIndex, columnCount),
                  children: inlineChildren(cell, { bold: rowIndex === 0, size: polished ? tableFontSize(columnCount) : undefined })
                })
              ]
            })
        )
      })
  );

  return new Table({
    width: {
      size: DOCX_CONTENT_WIDTH,
      type: WidthType.DXA
    },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: subtleTableBorders("D6DEE8"),
    rows
  });
}

function subtleTableBorders(outerColor: string) {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: outerColor },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: outerColor },
    left: { style: BorderStyle.SINGLE, size: 1, color: outerColor },
    right: { style: BorderStyle.SINGLE, size: 1, color: outerColor },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" }
  };
}

function noBorders() {
  const border = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
  return {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border
  };
}

function quoteCellBorders() {
  const border = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
  return {
    top: border,
    bottom: border,
    left: { style: BorderStyle.SINGLE, size: 12, color: "D1D5DB", space: 6 },
    right: border
  };
}

function calculateColumnWidths(table: MarkdownTable, columnCount: number): number[] {
  const minWidth = columnCount >= 8 ? 560 : columnCount >= 5 ? 760 : 1100;
  const hardMin = minWidth * columnCount > DOCX_CONTENT_WIDTH ? Math.floor(DOCX_CONTENT_WIDTH / columnCount) : minWidth;
  const available = Math.max(0, DOCX_CONTENT_WIDTH - hardMin * columnCount);
  const scores = Array.from({ length: columnCount }, (_unused, columnIndex) => {
    const cells = [table.headers[columnIndex], ...table.rows.map((row) => row[columnIndex])].filter(Boolean);
    const maxLength = Math.max(...cells.map((cell) => visibleLength(cell ?? "")), 1);
    const headerLength = visibleLength(table.headers[columnIndex] ?? "");
    return Math.max(1, Math.min(36, maxLength) + Math.min(18, headerLength) * 0.6);
  });
  const totalScore = scores.reduce((sum, score) => sum + score, 0) || 1;
  const widths = scores.map((score) => hardMin + Math.floor((available * score) / totalScore));
  const drift = DOCX_CONTENT_WIDTH - widths.reduce((sum, width) => sum + width, 0);
  widths[widths.length - 1] += drift;
  return widths;
}

function visibleLength(text: string): number {
  return stripInlineMarkup(text)
    .replace(/[\u4e00-\u9fff]/g, "aa")
    .length;
}

function tableFontSize(columnCount: number): number {
  if (columnCount >= 9) return 16;
  if (columnCount >= 6) return 18;
  return 20;
}

function cellAlignment(cell: string, cellIndex: number, columnCount: number): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (columnCount >= 8 && /^(编号|序号|负责人|开始|结束|状态|优先|比例|问题|\d+%?|\d+|高|中|低|已|待)/.test(stripInlineMarkup(cell))) {
    return AlignmentType.CENTER;
  }
  if (cellIndex === 0 && visibleLength(cell) <= 8) return AlignmentType.CENTER;
  return AlignmentType.LEFT;
}

function inlineChildren(text: string, options: InlineOptions = {}): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  const pattern =
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\[([^\]\n]+)]\(((?:https?:\/\/|mailto:|\/)[^)]+)\)|`[^`]+`|<u\b[^>]*>[\s\S]*?<\/u>|<mark\b[^>]*>[\s\S]*?<\/mark>|<sup\b[^>]*>[\s\S]*?<\/sup>|<sub\b[^>]*>[\s\S]*?<\/sub>|<(?:s|del|strike)\b[^>]*>[\s\S]*?<\/(?:s|del|strike)>|<(?:strong|b)\b[^>]*>[\s\S]*?<\/(?:strong|b)>|<(?:em|i)\b[^>]*>[\s\S]*?<\/(?:em|i)>|~~[^~]+~~|\*\*[^*]+\*\*|\*[^*]+\*)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      runs.push(textRun(text.slice(cursor, match.index), options));
    }

    const token = match[0];
    if (token.startsWith("$$")) {
      runs.push(latexToMathChild(token.slice(2, -2), true));
    } else if (token.startsWith("$")) {
      runs.push(latexToMathChild(token.slice(1, -1), false));
    } else if (token.startsWith("[")) {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      runs.push(
        new ExternalHyperlink({
          link: href,
          children: [textRun(stripInlineMarkup(label), { ...options, color: "0563C1", underline: true })]
        })
      );
    } else if (token.startsWith("`")) {
      runs.push(
        new TextRun({
          text: decodeHtmlEntities(token.slice(1, -1)),
          font: CODE_FONT,
          size: options.size ? Math.max(18, options.size - 2) : 20,
          shading: {
            type: ShadingType.CLEAR,
            fill: "E5E7EB"
          }
        })
      );
    } else if (/^<u\b/i.test(token)) {
      runs.push(...inlineChildren(innerHtmlText(token, "u"), { ...options, underline: true }));
    } else if (/^<mark\b/i.test(token)) {
      runs.push(...inlineChildren(innerHtmlText(token, "mark"), { ...options, highlight: true }));
    } else if (/^<sup\b/i.test(token)) {
      runs.push(...inlineChildren(innerHtmlText(token, "sup"), { ...options, superScript: true }));
    } else if (/^<sub\b/i.test(token)) {
      runs.push(...inlineChildren(innerHtmlText(token, "sub"), { ...options, subScript: true }));
    } else if (/^<(s|del|strike)\b/i.test(token) || token.startsWith("~~")) {
      const inner = token.startsWith("~~") ? token.slice(2, -2) : innerHtmlText(token, "s");
      runs.push(...inlineChildren(inner, { ...options, strike: true }));
    } else if (/^<(strong|b)\b/i.test(token)) {
      runs.push(...inlineChildren(innerHtmlText(token, "strong"), { ...options, bold: true }));
    } else if (/^<(em|i)\b/i.test(token)) {
      runs.push(...inlineChildren(innerHtmlText(token, "em"), { ...options, italics: true }));
    } else if (token.startsWith("**")) {
      runs.push(...inlineChildren(token.slice(2, -2), { ...options, bold: true }));
    } else {
      runs.push(...inlineChildren(token.slice(1, -1), { ...options, italics: true }));
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    runs.push(textRun(text.slice(cursor), options));
  }

  return runs.length > 0 ? runs : [new TextRun(" ")];
}

function textRun(text: string, options: InlineOptions): TextRun {
  return new TextRun({
    text: decodeHtmlEntities(text),
    bold: options.bold,
    italics: options.italics,
    underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
    strike: options.strike,
    highlight: options.highlight ? HighlightColor.YELLOW : undefined,
    subScript: options.subScript,
    superScript: options.superScript,
    color: options.color,
    size: options.size
  });
}

function innerHtmlText(token: string, fallbackTag: string): string {
  const tag = token.match(/^<([a-z0-9]+)/i)?.[1] ?? fallbackTag;
  const pattern = new RegExp(`^<${tag}\\\\b[^>]*>([\\\\s\\\\S]*?)<\\\\/${tag}>$`, "i");
  const direct = pattern.exec(token)?.[1];
  if (direct !== undefined) return direct;

  return token.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>$/, "");
}

function stripInlineMarkup(text: string): string {
  return decodeHtmlEntities(
    text
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/[*_`~]+/g, "")
      .trim()
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function latexToMathChild(latex: string, display: boolean): ParagraphChild {
  const normalized = normalizeLatexForDocx(latex);
  try {
    return mathMlToDocxMath(latexToMathMl(normalized, display), display);
  } catch {
    return new TextRun({
      text: display ? `$$${normalized}$$` : `$${normalized}$`,
      font: "Courier New",
      size: 20
    });
  }
}

function latexToMathMl(latex: string, display: boolean): string {
  const rendered = katex.renderToString(latex, {
    displayMode: display,
    output: "mathml",
    throwOnError: false
  });
  const math = rendered.match(/<math[\s\S]*<\/math>/)?.[0] ?? rendered;
  return math.replace(/<annotation[\s\S]*?<\/annotation>/g, "");
}

function normalizeLatexForDocx(latex: string): string {
  return normalizeLatexForConverter(latex);
}

function isSpecialMarkdownStart(line: string): boolean {
  return /^(#{1,6})\s+/.test(line) || /^```/.test(line.trim()) || /^\$\$/.test(line.trim()) || /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || /^>\s?/.test(line) || line.includes("|");
}
