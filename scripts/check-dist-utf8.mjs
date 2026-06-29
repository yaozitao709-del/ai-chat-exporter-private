import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { TextDecoder } from "node:util";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const decoder = new TextDecoder("utf-8", { fatal: true });
const checked = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }

    const bytes = readFileSync(path);
    try {
      decoder.decode(bytes);
    } catch (error) {
      throw new Error(`Dist file is not valid UTF-8: ${path}\n${error instanceof Error ? error.message : String(error)}`);
    }
    if (path.endsWith(".js") && bytes.some((byte) => byte > 0x7f)) {
      throw new Error(`Dist JavaScript file still contains non-ASCII bytes: ${path}`);
    }
    checked.push(path);
  }
}

walk(distDir);
console.log(`UTF-8 dist check passed: ${checked.length} files; JavaScript files are ASCII-only`);
