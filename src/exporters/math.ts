import { ImportedXmlComponent, type ParagraphChild } from "docx";
import { mml2omml } from "@hungknguyen/mathml2omml";

export function mathMlToDocxMath(mathMl: string, display = false): ParagraphChild {
  const omml = stripInvisibleMathChars(mml2omml(stripUnsupportedMathMl(mathMl), { disableDecode: true }));
  return xmlToImportedComponent(display ? wrapDisplayMath(omml) : omml) as unknown as ParagraphChild;
}

function stripUnsupportedMathMl(mathMl: string): string {
  let current = mathMl;
  let previous = "";

  while (current !== previous) {
    previous = current;
    current = current
      .replace(/<mpadded\b[^>]*>([\s\S]*?)<\/mpadded>/gi, "$1")
      .replace(/<mspace\b[^>]*\/?>/gi, "")
      .replace(/[\u2061-\u2064]/g, "")
      .replace(/&#x206[1-4];/gi, "");
  }

  return current;
}

function stripInvisibleMathChars(omml: string): string {
  return wrapBareMathSlotText(omml)
    .replace(/[\u2061-\u2064]/g, "")
    .replace(/&#x206[1-4];/gi, "")
    .replace(/<m:sty\s+m:val="undefined"\s*\/>/g, "")
    .replace(/<m:e\s*\/>/g, "")
    .replace(/<m:e>\s*<\/m:e>/g, "");
}

function wrapDisplayMath(omml: string): string {
  const math = omml
    .replace(/\s+xmlns:m="[^"]*"/g, "")
    .replace(/\s+xmlns:w="[^"]*"/g, "");

  return `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${math}</m:oMathPara>`;
}

function xmlToImportedComponent(xml: string): ImportedXmlComponent {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("无法解析 Word 公式 XML");
  }

  return elementToImportedComponent(document.documentElement);
}

function elementToImportedComponent(element: Element): ImportedXmlComponent {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    attributes[attribute.name] = attribute.value;
  }

  const component = new ImportedXmlComponent(element.nodeName, attributes);
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      component.push(elementToImportedComponent(child as Element));
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent !== null) {
      component.push(child.textContent);
    }
  }

  return component;
}

function wrapBareMathSlotText(omml: string): string {
  let result = "";
  let cursor = 0;
  const openTag = /<m:e(?:\s[^>]*)?>/g;

  while (true) {
    openTag.lastIndex = cursor;
    const start = openTag.exec(omml);
    if (!start) {
      result += omml.slice(cursor);
      break;
    }

    result += omml.slice(cursor, start.index);

    const token = /<m:e(?:\s[^>]*)?>|<\/m:e>/g;
    token.lastIndex = openTag.lastIndex;
    let depth = 1;
    let end: RegExpExecArray | null = null;

    while ((end = token.exec(omml))) {
      depth += end[0].startsWith("</") ? -1 : 1;
      if (depth === 0) break;
    }

    if (!end) {
      result += omml.slice(start.index);
      break;
    }

    const content = omml.slice(openTag.lastIndex, end.index);
    result += `${start[0]}${wrapTopLevelText(content)}</m:e>`;
    cursor = token.lastIndex;
  }

  return result;
}

function wrapTopLevelText(content: string): string {
  let result = "";
  let cursor = 0;
  let depth = 0;
  const tag = /<[^>]+>/g;
  let match: RegExpExecArray | null;

  while ((match = tag.exec(content))) {
    appendText(content.slice(cursor, match.index));
    result += match[0];

    if (match[0].startsWith("</")) {
      depth = Math.max(0, depth - 1);
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }

    cursor = tag.lastIndex;
  }

  appendText(content.slice(cursor));
  return result;

  function appendText(text: string): void {
    if (!text) return;
    if (depth === 0 && text.trim()) {
      result += `<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`;
    } else {
      result += text;
    }
  }
}
