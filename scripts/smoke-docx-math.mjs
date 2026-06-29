import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import katex from "katex";
import { mml2omml } from "@hungknguyen/mathml2omml";

const require = createRequire(import.meta.url);
const { Document, ImportedXmlComponent, Packer, Paragraph } = require("../node_modules/docx/dist/index.cjs");
const formulas = [
  String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}+\sqrt[3]{\frac{\alpha+\beta}{\gamma-\delta}}`,
  String.raw`f(x)=\begin{cases}\dfrac{\sin x}{x}, & x\neq 0\\1, & x=0\\+\infty, & x\to\infty\end{cases}`,
  String.raw`S_n=\sum_{k=1}^{n}\left(\prod_{j=1}^{k}\frac{j^2+\alpha_j}{j^2+\beta_j}\right)\exp\left(-\frac{k^2}{2\sigma^2}\right)`,
  String.raw`\lim_{n\to\infty}\left[\sum_{k=1}^{n}\frac{1}{n}f\left(\frac{k}{n}\right)\right]=\int_0^1 f(x)\,dx`,
  String.raw`A=\begin{pmatrix}a_{11} & a_{12} & \cdots & a_{1n}\\a_{21} & a_{22} & \cdots & a_{2n}\\\vdots & \vdots & \ddots & \vdots\\a_{n1} & a_{n2} & \cdots & a_{nn}\end{pmatrix},\qquad A^{-1}=\frac{1}{\det(A)}\operatorname{adj}(A)`,
  String.raw`\begin{aligned}(a+b)^4&=a^4+4a^3b+6a^2b^2+4ab^3+b^4\\&=(a^2+2ab+b^2)^2\end{aligned}`,
  String.raw`\operatorname{KL}\left(\rho\;\middle\|\;\hat{\rho}\right)=\rho\log\frac{\rho}{\hat{\rho}}+(1-\rho)\log\frac{1-\rho}{1-\hat{\rho}}`
];

function latexToOmml(latex) {
  const rendered = katex.renderToString(normalizeLatexForConverter(latex), {
    displayMode: true,
    output: "mathml",
    throwOnError: false
  });
  const mathml = (rendered.match(/<math[\s\S]*<\/math>/)?.[0] ?? rendered).replace(/<annotation[\s\S]*?<\/annotation>/g, "");
  return wrapDisplayMath(stripInvisibleMathChars(mml2omml(stripUnsupportedMathMl(mathml), { disableDecode: true })));
}

function stripUnsupportedMathMl(mathml) {
  let current = mathml;
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

function stripInvisibleMathChars(omml) {
  return wrapBareMathSlotText(omml)
    .replace(/[\u2061-\u2064]/g, "")
    .replace(/&#x206[1-4];/gi, "")
    .replace(/<m:sty\s+m:val="undefined"\s*\/>/g, "")
    .replace(/<m:e\s*\/>/g, "")
    .replace(/<m:e>\s*<\/m:e>/g, "");
}

function wrapDisplayMath(omml) {
  const math = omml.replace(/\s+xmlns:m="[^"]*"/g, "").replace(/\s+xmlns:w="[^"]*"/g, "");
  return `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${math}</m:oMathPara>`;
}

function xmlToImportedComponent(xml) {
  const tokens = xml.match(/<[^>]+>|[^<]+/g) ?? [];
  const stack = [];
  let root = null;

  for (const token of tokens) {
    if (token.startsWith("<?") || token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      stack.pop();
      continue;
    }

    if (token.startsWith("<")) {
      const selfClosing = /\/>$/.test(token);
      const body = token.slice(1, selfClosing ? -2 : -1).trim();
      const spaceIndex = body.search(/\s/);
      const name = spaceIndex < 0 ? body : body.slice(0, spaceIndex);
      const attrText = spaceIndex < 0 ? "" : body.slice(spaceIndex + 1);
      const attrs = {};
      for (const match of attrText.matchAll(/([:\w-]+)="([^"]*)"/g)) {
        attrs[match[1]] = match[2];
      }

      const component = new ImportedXmlComponent(name, attrs);
      if (stack.length > 0) stack[stack.length - 1].push(component);
      else root = component;
      if (!selfClosing) stack.push(component);
      continue;
    }

    if (stack.length > 0) stack[stack.length - 1].push(token);
  }

  if (!root) throw new Error("Could not parse OMML root");
  return root;
}

function wrapBareMathSlotText(omml) {
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
    let end = null;

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

function wrapTopLevelText(content) {
  let result = "";
  let cursor = 0;
  let depth = 0;
  const tag = /<[^>]+>/g;
  let match = null;

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

  function appendText(text) {
    if (!text) return;
    if (depth === 0 && text.trim()) {
      result += `<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`;
    } else {
      result += text;
    }
  }
}

function normalizeLatexForConverter(value) {
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

function normalizeLatex(value) {
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

function normalizeAlignedEnvironment(value) {
  return value.replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, (_match, body) => {
    return `\\begin{aligned}${body.replace(/&/g, "")}\\end{aligned}`;
  });
}

const doc = new Document({
  sections: [
    {
      children: [
        ...formulas.map(
          (formula) =>
            new Paragraph({
              children: [xmlToImportedComponent(latexToOmml(formula))]
            })
        )
      ]
    }
  ]
});

const outDir = mkdtempSync(join(tmpdir(), "ai-chat-exporter-math-"));
const outPath = join(outDir, "math-smoke.docx");
const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);

const documentXml = execFileSync("unzip", ["-p", outPath, "word/document.xml"], {
  encoding: "utf8"
});

const mathCount = (documentXml.match(/<m:oMath/g) ?? []).length;
if (mathCount < formulas.length) {
  throw new Error(`DOCX math smoke test failed: expected at least ${formulas.length} <m:oMath> nodes, found ${mathCount}`);
}

const mathParaCount = (documentXml.match(/<m:oMathPara/g) ?? []).length;
if (mathParaCount < formulas.length) {
  throw new Error(`DOCX math smoke test failed: expected at least ${formulas.length} <m:oMathPara> nodes, found ${mathParaCount}`);
}

const forbiddenPatterns = [/<undefined>/, /\\qquad/, /\\middle/, /[\u2061-\u2064]/, /&#x206[1-4];/i, /<m:sty\s+m:val="undefined"\s*\/>/, /<m:e\s*\/>/, /<m:e>[^<]+<\/m:e>/];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(documentXml)) {
    throw new Error(`DOCX math smoke test failed: forbidden math residue remained: ${pattern}`);
  }
}

console.log(`DOCX math smoke test passed with ${mathCount} formulas: ${outPath}`);
