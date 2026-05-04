#!/usr/bin/env node
// Pre-push gate for the storybook-curator's Rule 1 + Rule 2:
//   1. Every UI component file has a co-located __stories__/<Name>.stories.tsx.
//   2. Every *.stories.tsx imports a component file that exists.
// The deeper rules (state coverage, interaction tests, autodocs description)
// are agent-only — they require reasoning, not a shell diff.
//
// See `.claude/agents/storybook-curator.md` for the canonical rules.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

// Top-level scanning roots — `walk()` is recursive, so listing the parent
// (`src/options/components`) automatically covers the `cards/` and `modals/`
// children. Don't add overlapping entries; that produces duplicate findings.
const COMPONENT_ROOTS = [
  "src/options/components",
  "src/content/modals",
  "src/content/toasts",
];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function listComponents() {
  const components = [];
  for (const root of COMPONENT_ROOTS) {
    for (const f of walk(join(ROOT, root))) {
      if (!f.endsWith(".tsx")) continue;
      if (f.includes("/__tests__/") || f.includes("/__stories__/")) continue;
      const name = basename(f, ".tsx");
      // Convention: top-level component files start with an uppercase letter.
      if (!/^[A-Z]/.test(name)) continue;
      components.push({ file: f, name, dir: dirname(f) });
    }
  }
  return components;
}

function listStoryFiles() {
  const stories = [];
  for (const root of COMPONENT_ROOTS) {
    for (const f of walk(join(ROOT, root))) {
      if (!f.endsWith(".stories.tsx")) continue;
      if (!f.includes("/__stories__/")) continue;
      const name = basename(f, ".stories.tsx");
      stories.push({ file: f, name, storiesDir: dirname(f) });
    }
  }
  return stories;
}

function rule1MissingStories(components, stories) {
  const findings = [];
  const storyMap = new Map(); // <componentName>::<parent-of-__stories__> -> story file
  for (const s of stories) {
    const componentDir = resolve(s.storiesDir, "..");
    storyMap.set(`${s.name}::${componentDir}`, s.file);
  }
  for (const c of components) {
    if (!storyMap.has(`${c.name}::${c.dir}`)) {
      findings.push({
        rule: 1,
        component: c.file.replace(`${ROOT}/`, ""),
        suggested: `${c.dir.replace(`${ROOT}/`, "")}/__stories__/${c.name}.stories.tsx`,
      });
    }
  }
  return findings;
}

function rule2OrphanStories(stories) {
  const findings = [];
  for (const s of stories) {
    const src = readFileSync(s.file, "utf8");
    // Re-create the regex each iteration so lastIndex doesn't leak across
    // files in the `g`-flagged exec loop.
    const importRe = /from\s+["']\.\.\/([A-Z][\w/]+)["']/g;
    let m;
    let foundComponent = false;
    while ((m = importRe.exec(src))) {
      const rel = m[1];
      const target = resolve(s.storiesDir, "..", `${rel}.tsx`);
      if (existsSync(target)) {
        foundComponent = true;
        break;
      }
    }
    if (!foundComponent) {
      findings.push({
        rule: 2,
        story: s.file.replace(`${ROOT}/`, ""),
        reason: "no parent-relative '../<Component>' import resolves to an existing .tsx",
      });
    }
  }
  return findings;
}

function main() {
  const components = listComponents();
  const stories = listStoryFiles();
  const r1 = rule1MissingStories(components, stories);
  const r2 = rule2OrphanStories(stories);

  if (r1.length === 0 && r2.length === 0) {
    console.log(
      `storybook-coverage: OK — ${components.length} components, ${stories.length} story files, no drift.`,
    );
    process.exit(0);
  }

  console.error("storybook-coverage: drift detected.\n");

  if (r1.length > 0) {
    console.error("Rule 1 — components without a co-located story file:");
    for (const f of r1) {
      console.error(`  ${f.component}`);
      console.error(`    suggested: ${f.suggested}`);
    }
    console.error("");
  }

  if (r2.length > 0) {
    console.error("Rule 2 — orphan stories (component import does not resolve):");
    for (const f of r2) {
      console.error(`  ${f.story}`);
      console.error(`    ${f.reason}`);
    }
    console.error("");
  }

  console.error(
    "Resolve by either (a) scaffolding the missing story / pruning the orphan,",
  );
  console.error(
    "or (b) running the storybook-curator agent for a fuller audit (state",
  );
  console.error(
    "coverage, interaction tests, autodocs description) — see",
  );
  console.error("`.claude/agents/storybook-curator.md`.");
  process.exit(1);
}

main();
