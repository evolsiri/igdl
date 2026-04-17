#!/usr/bin/env node
/**
 * Multi-entry extension build orchestrator.
 *
 * Runs multiple Vite passes:
 *  1. Options page (uses vite.config.ts: Preact + Tailwind plugins).
 *  2. Each content/background/inject/xhr/loader entry as a self-contained
 *     library build so the output is a single file per entry (content scripts
 *     don't support ES-module import statements in MV3).
 *
 * After the builds, copies the per-browser manifest (with version injected
 * from package.json) and any public/ assets into `dist/<target>/`.
 *
 * Usage: `TARGET=chrome node scripts/build.mjs`
 *        `TARGET=firefox node scripts/build.mjs`
 */

import preact from "@preact/preset-vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const TARGET = process.env.TARGET;

if (TARGET !== "chrome" && TARGET !== "firefox") {
  console.error(`[build] TARGET must be "chrome" or "firefox" (got "${TARGET ?? "undefined"}")`);
  process.exit(1);
}

const OUT = path.join(root, "dist", TARGET);

console.log(`\n→ Cleaning ${path.relative(root, OUT)}…`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ─── Pass 1 ── options page ─────────────────────────────────────────────────
console.log(`\n→ Building options page…`);
await build({
  root,
  configFile: path.join(root, "vite.config.ts"),
  build: {
    outDir: OUT,
    emptyOutDir: false,
  },
  logLevel: "warn",
});

// ─── Pass 2..N ── library-mode builds for each standalone entry ─────────────
const entries = [
  { name: "content", input: "src/content/index.ts", format: "iife" },
  { name: "inject", input: "src/inject.ts", format: "iife" },
  // Service worker (Chrome) is a module; background scripts (Firefox) are IIFE.
  { name: "background", input: `src/background/${TARGET}.ts`, format: TARGET === "chrome" ? "es" : "iife" },
];
if (TARGET === "firefox") {
  entries.push({ name: "loader", input: "src/content/loader.ts", format: "iife" });
}

for (const entry of entries) {
  console.log(`\n→ Building ${entry.name}.js (${entry.format})…`);
  await build({
    root,
    configFile: false,
    plugins: [preact()],
    build: {
      outDir: OUT,
      emptyOutDir: false,
      minify: true,
      lib: {
        entry: path.join(root, entry.input),
        name: `igdl_${entry.name}`,
        formats: [entry.format],
        fileName: () => `${entry.name}.js`,
      },
    },
    logLevel: "warn",
  });
}

// ─── Manifest copy with version injection ───────────────────────────────────
console.log(`\n→ Copying manifest (version from package.json)…`);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const manifestSrc = path.join(root, "src/manifest", `${TARGET}.manifest.json`);
const manifest = JSON.parse(fs.readFileSync(manifestSrc, "utf-8"));
manifest.version = pkg.version;
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

// ─── Public assets (favicon, icons, etc.) ───────────────────────────────────
const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  for (const item of fs.readdirSync(publicDir)) {
    const src = path.join(publicDir, item);
    const dest = path.join(OUT, item);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

console.log(`\n✓ Built ${TARGET} extension → ${path.relative(root, OUT)}\n`);
