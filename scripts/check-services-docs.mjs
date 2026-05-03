#!/usr/bin/env node
/**
 * Pre-commit guard: enforces 1:1 parity between `src/services/*` directories
 * and `docs/services/*.md` files.
 *
 * Every service folder under `src/services/` must have a matching
 * `docs/services/<name>.md`, and vice versa. The convention is documented in
 * `docs/code-style-guide.md` and `.claude/agents/README.md`. This script gates
 * the contract at commit time so a new service can't land without its doc.
 *
 * Exits non-zero on any mismatch. Bypass with `git commit --no-verify` for WIP.
 *
 * @example
 *   node scripts/check-services-docs.mjs
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SERVICES_DIR = "src/services";
const DOCS_DIR = "docs/services";

function listServices() {
  return readdirSync(SERVICES_DIR)
    .filter((name) => {
      try {
        return statSync(join(SERVICES_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function listDocs() {
  return readdirSync(DOCS_DIR)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
}

const services = new Set(listServices());
const docs = new Set(listDocs());

const missingDocs = [...services].filter((s) => !docs.has(s));
const orphanDocs = [...docs].filter((d) => !services.has(d));

if (missingDocs.length === 0 && orphanDocs.length === 0) process.exit(0);

console.error("\nService ↔ doc parity broken.");
console.error("  Convention: every src/services/<name>/ has a matching docs/services/<name>.md");
console.error("  Bypass once with: git commit --no-verify\n");
for (const name of missingDocs) {
  console.error(`  src/services/${name}/  is missing  docs/services/${name}.md`);
}
for (const name of orphanDocs) {
  console.error(`  docs/services/${name}.md  has no matching  src/services/${name}/`);
}
console.error("");
process.exit(1);
