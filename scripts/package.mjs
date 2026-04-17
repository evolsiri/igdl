#!/usr/bin/env node
/**
 * Packages a built extension for distribution.
 *
 * Chrome → zips `dist/chrome/` into `artifacts/igdl-chrome-<version>.zip`
 *          (root-level manifest.json — Chrome Web Store requirement).
 * Firefox → `web-ext build` produces `artifacts/igdl-firefox-<version>.xpi`
 *          suitable for Mozilla AMO submission.
 *
 * Usage: `TARGET=chrome node scripts/package.mjs`
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const TARGET = process.env.TARGET;

if (TARGET !== "chrome" && TARGET !== "firefox") {
  console.error(`[package] TARGET must be "chrome" or "firefox" (got "${TARGET ?? "undefined"}")`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const version = pkg.version;
const distDir = path.join(root, "dist", TARGET);
const artifactsDir = path.join(root, "artifacts");

if (!fs.existsSync(distDir)) {
  console.error(`[package] ${path.relative(root, distDir)} does not exist — run pnpm run build:${TARGET} first.`);
  process.exit(1);
}

fs.mkdirSync(artifactsDir, { recursive: true });

if (TARGET === "chrome") {
  const outFile = path.join(artifactsDir, `igdl-chrome-${version}.zip`);
  fs.rmSync(outFile, { force: true });
  console.log(`\n→ Zipping ${path.relative(root, distDir)} → ${path.relative(root, outFile)}`);
  execSync(`zip -r "${outFile}" .`, { cwd: distDir, stdio: "inherit" });
  console.log(`\n✓ Packaged Chrome extension: ${path.relative(root, outFile)}\n`);
} else {
  console.log(`\n→ web-ext build ${path.relative(root, distDir)}`);
  execSync(
    `pnpm exec web-ext build --source-dir="${distDir}" --artifacts-dir="${artifactsDir}" --overwrite-dest`,
    { stdio: "inherit" },
  );
  console.log(`\n✓ Packaged Firefox extension → ${path.relative(root, artifactsDir)}\n`);
}
