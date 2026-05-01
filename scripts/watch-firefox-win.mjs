#!/usr/bin/env node
/**
 * Dev watch mode for Firefox on WSL2.
 *
 * Runs an initial build, copies dist/firefox to C:\temp\igdl-ext, then
 * watches src/ for changes and repeats. After each copy, press "Reload"
 * in about:debugging (the temp extension must be loaded from
 * C:\temp\igdl-ext\manifest.json, not a WSL path).
 *
 * Usage: pnpm run dev:firefox:win
 */

import { watch } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const WIN_DEST = "/mnt/c/temp/igdl-ext";

let building = false;
let pending = false;

function runBuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  console.log("\n[watch] Building firefox…");
  try {
    execSync(`TARGET=firefox node scripts/build.mjs`, { cwd: root, stdio: "inherit" });
    execSync(`cp -r dist/firefox/. ${WIN_DEST}/`, { cwd: root, stdio: "inherit" });
    console.log("[watch] ✓ Copied to C:\\temp\\igdl-ext — press Reload in about:debugging");
  } catch {
    console.error("[watch] Build failed — fix errors and save again");
  }
  building = false;
  if (pending) {
    pending = false;
    runBuild();
  }
}

runBuild();

let debounce;
watch(srcDir, { recursive: true }, () => {
  clearTimeout(debounce);
  debounce = setTimeout(runBuild, 300);
});

console.log(`\n[watch] Watching src/ — save a file to trigger a rebuild`);
