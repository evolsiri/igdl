#!/usr/bin/env node
/**
 * Pre-commit guard: blocks 6-character hex color literals in markdown files.
 *
 * Brand colors are defined once in `src/index.css` (options-page tokens) and
 * `src/content/tokens.ts` (injected-UI tokens). Markdown should refer to the
 * token names (e.g. `--color-brand-green`), not the literal hex value, so the
 * docs stay correct when the canonical token value changes.
 *
 * Receives staged `.md` files as argv. Exits non-zero on the first match.
 *
 * @example
 *   node scripts/check-hex-literals.mjs path/to/file.md
 */

import { readFileSync } from "node:fs";

const PATTERN = /#[0-9a-fA-F]{6}\b/;

const files = process.argv.slice(2);
const findings = [];

for (const file of files) {
  if (!file.endsWith(".md")) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(PATTERN);
    if (match) findings.push({ file, line: i + 1, hex: match[0] });
  }
}

if (findings.length === 0) process.exit(0);

console.error("\nHex color literals found in markdown — refer to a token name instead.");
console.error("  Canonical sources: src/index.css, src/content/tokens.ts");
console.error("  Bypass once with: git commit --no-verify\n");
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.hex}`);
}
console.error("");
process.exit(1);
