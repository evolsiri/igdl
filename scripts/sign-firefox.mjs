#!/usr/bin/env node
/**
 * Signs the built Firefox extension via the AMO REST API (web-ext sign).
 *
 * Pre-requisites:
 *   - `pnpm run build:firefox` has produced dist/firefox/.
 *   - FIREFOX_API_KEY (AMO JWT issuer) and FIREFOX_API_SECRET set in the
 *     environment, e.g. via `.env` (gitignored) or shell exports.
 *     Generate at https://addons.mozilla.org/developers/addon/api/key/.
 *
 * Channels:
 *   - unlisted (default): self-distribution. AMO signs and returns the XPI
 *     synchronously (typically <5 min). Sideload-installable, no review.
 *   - listed: AMO public catalog. Submission is queued for Mozilla review;
 *     signed XPI lands only after approval.
 *
 * Env-var contract (browser-prefixed; web-ext-native names are an
 * implementation detail and never appear in user-facing config):
 *   FIREFOX_API_KEY     → JWT issuer  (translated to WEB_EXT_API_KEY for the child)
 *   FIREFOX_API_SECRET  → JWT secret  (translated to WEB_EXT_API_SECRET for the child)
 *   FIREFOX_CHANNEL     → "listed" | "unlisted" (overridable via --channel)
 *
 * Usage:
 *   pnpm run sign:firefox
 *   pnpm run sign:firefox -- --channel=listed
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, requireFirefoxSigningEnv } from "./lib/firefox-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ─── 1. Load .env (shell env always wins) ───────────────────────────────────
loadDotEnv(root);

// ─── 2. Parse channel (CLI > FIREFOX_CHANNEL > default "unlisted") ──────────
let channel = process.env.FIREFOX_CHANNEL ?? "unlisted";
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--channel=(listed|unlisted)$/);
  if (m) channel = m[1];
}
if (channel !== "listed" && channel !== "unlisted") {
  console.error(
    `[sign:firefox] --channel must be "listed" or "unlisted" (got "${channel}")`,
  );
  process.exit(1);
}

// ─── 3. Validate built artifacts present ────────────────────────────────────
const distDir = path.join(root, "dist", "firefox");
if (!fs.existsSync(path.join(distDir, "manifest.json"))) {
  console.error(
    `[sign:firefox] dist/firefox/manifest.json not found — run pnpm run build:firefox first.`,
  );
  process.exit(1);
}

// ─── 4. Validate credentials ────────────────────────────────────────────────
const { apiKey, apiSecret } = requireFirefoxSigningEnv();

// ─── 5. Read version + ensure artifacts dir ─────────────────────────────────
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf-8"),
);
const version = pkg.version;
const artifactsDir = path.join(root, "artifacts");
fs.mkdirSync(artifactsDir, { recursive: true });

// ─── 6. Build the child env: translate FIREFOX_* → WEB_EXT_* ────────────────
//      web-ext only reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET. We keep the
//      user-facing contract browser-prefixed and do the mapping here so the
//      tool-native names never leak into shells, .env, or CI secrets.
const childEnv = {
  ...process.env,
  WEB_EXT_API_KEY: apiKey,
  WEB_EXT_API_SECRET: apiSecret,
};
delete childEnv.FIREFOX_API_KEY;
delete childEnv.FIREFOX_API_SECRET;

// ─── 7. Pre-flight web-ext lint ─────────────────────────────────────────────
console.log(`\n→ web-ext lint dist/firefox`);
const lint = spawnSync(
  "pnpm",
  ["exec", "web-ext", "lint", "--source-dir", distDir],
  { stdio: "inherit", env: childEnv },
);
if (lint.status !== 0) {
  console.error(
    `\n[sign:firefox] web-ext lint failed — fix the errors above before signing.`,
  );
  process.exit(lint.status ?? 1);
}

// ─── 8. Sign (credentials passed via env, NEVER CLI args) ───────────────────
//      Process arg lists (/proc/<pid>/cmdline) are world-readable on Linux;
//      env stays in the process. web-ext picks WEB_EXT_API_KEY/SECRET from env.
console.log(`\n→ web-ext sign --channel=${channel} dist/firefox`);
const sign = spawnSync(
  "pnpm",
  [
    "exec",
    "web-ext",
    "sign",
    "--source-dir",
    distDir,
    "--artifacts-dir",
    artifactsDir,
    "--channel",
    channel,
  ],
  { stdio: "inherit", env: childEnv },
);
if (sign.status !== 0) {
  console.error(`\n[sign:firefox] web-ext sign failed.`);
  process.exit(sign.status ?? 1);
}

// ─── 9. Rename to match the existing artifact naming convention ─────────────
//      web-ext drops the signed file as `igdl-<version>.xpi`; the rest of the
//      pipeline (release.yml, docs/release.md) uses `igdl-firefox-<version>`.
const defaultXpi = path.join(artifactsDir, `igdl-${version}.xpi`);
const finalXpi = path.join(artifactsDir, `igdl-firefox-${version}.xpi`);
if (fs.existsSync(defaultXpi)) {
  fs.rmSync(finalXpi, { force: true });
  fs.renameSync(defaultXpi, finalXpi);
  console.log(
    `\n✓ Signed Firefox extension → ${path.relative(root, finalXpi)}\n`,
  );
} else if (channel === "listed") {
  console.log(
    `\n✓ Submitted to AMO for listed-channel review.` +
      `\n  Signed XPI lands in artifacts/ once Mozilla approves.` +
      `\n  Track at https://addons.mozilla.org/developers/\n`,
  );
} else {
  console.warn(
    `\n⚠ Sign succeeded but ${path.relative(root, defaultXpi)} not found.` +
      `\n  Inspect artifacts/ for the actual filename.\n`,
  );
}
