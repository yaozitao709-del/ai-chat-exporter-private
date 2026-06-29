import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const jsFiles = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (path.endsWith(".js")) jsFiles.push(path);
  }
}

function escapeNonAscii(value) {
  return Array.from(value, (char) => {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x7f) return char;
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, "0")}`;

    const normalized = codePoint - 0x10000;
    const high = 0xd800 + (normalized >> 10);
    const low = 0xdc00 + (normalized & 0x3ff);
    return `\\u${high.toString(16)}\\u${low.toString(16)}`;
  }).join("");
}

walk(distDir);

for (const path of jsFiles) {
  const source = readFileSync(path, "utf8");
  const escaped = escapeNonAscii(source);
  if (escaped !== source) {
    writeFileSync(path, escaped, "utf8");
  }
}

console.log(`ASCII JS dist rewrite complete: ${jsFiles.length} files`);
