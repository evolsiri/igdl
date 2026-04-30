#!/usr/bin/env node
/**
 * Local Firefox release-candidate pipeline.
 *
 * Version selection (precedence: CLI arg > FIREFOX_RC_VERSION > auto-patch):
 *   1. positional CLI arg, e.g. `pnpm run rc:firefox -- 1.5.0`
 *   2. `FIREFOX_RC_VERSION` env var, e.g. `FIREFOX_RC_VERSION=1.5.0 pnpm run rc:firefox`
 *   3. default: auto-increment the patch component of the current
 *      `package.json` version (e.g. 1.0.3 → 1.0.4)
 *
 * Pre-flight (fails fast, in this order, before doing any work):
 *   1. resolved version is valid semver
 *   2. all required env vars set (via shared firefox-env)
 *   3. working tree is clean (`git status --porcelain` empty)
 *   4. tag `v<version>` does not exist locally
 *
 * Pipeline:
 *   sync versions in package.json + both manifests
 *     → build:firefox → package:firefox → sign:firefox
 *
 * On any pipeline-step failure: reverts the version bump
 * (`git checkout -- <files>`) so the working tree is clean for re-run.
 *
 * On success: creates `chore: release <version>` commit + annotated
 * `v<version>` tag locally. Tag push is intentionally NOT automatic.
 *
 * Usage:
 *   pnpm run rc:firefox                       # auto-bump patch
 *   pnpm run rc:firefox -- 1.5.0              # explicit CLI override
 *   FIREFOX_RC_VERSION=1.5.0 pnpm run rc:firefox  # env override
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, requireFirefoxSigningEnv } from "./lib/firefox-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ─── 1. Resolve target version (CLI > FIREFOX_RC_VERSION > auto-patch) ──────
//      pnpm 9 forwards the `--` separator literally; strip it so callers can
//      use either `pnpm run rc:firefox -- 1.0.4` or `pnpm run rc:firefox 1.0.4`.
const cliArgs = process.argv.slice(2).filter((a) => a !== "--");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function readPkgVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf-8"),
  );
  return pkg.version;
}

function bumpPatch(v) {
  const m = v.match(SEMVER);
  if (!m) {
    console.error(
      `[rc:firefox] Cannot auto-bump: package.json version "${v}" is not semver.`,
    );
    process.exit(1);
  }
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

let version;
let versionSource;
if (cliArgs[0]) {
  version = cliArgs[0];
  versionSource = "CLI arg";
} else if (process.env.FIREFOX_RC_VERSION) {
  version = process.env.FIREFOX_RC_VERSION;
  versionSource = "FIREFOX_RC_VERSION env";
} else {
  version = bumpPatch(readPkgVersion());
  versionSource = "auto-bumped patch";
}

if (!SEMVER.test(version)) {
  console.error(
    `[rc:firefox] Invalid version "${version}" (from ${versionSource}) — must be semver (e.g. 1.0.4).`,
  );
  process.exit(1);
}
const tag = `v${version}`;
console.log(`[rc:firefox] Target version: ${version} (${versionSource})`);

// ─── 2. Pre-flight: env vars (FAIL FAST before any other work) ──────────────
//      sign:firefox would catch this eventually, but only after build +
//      package burn minutes. Doing it here saves the round-trip.
loadDotEnv(root);
requireFirefoxSigningEnv();

// ─── 3. Pre-flight: clean working tree ──────────────────────────────────────
const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf-8",
});
if (status.status !== 0) {
  console.error("[rc:firefox] git status failed.");
  process.exit(status.status ?? 1);
}
if (status.stdout.trim() !== "") {
  console.error(
    "[rc:firefox] Working tree has uncommitted changes — commit or stash before running rc:firefox:",
  );
  console.error(status.stdout);
  process.exit(1);
}

// ─── 4. Pre-flight: tag does not already exist locally ──────────────────────
const tagCheck = spawnSync(
  "git",
  ["rev-parse", "-q", "--verify", `refs/tags/${tag}`],
  { cwd: root, stdio: "ignore" },
);
if (tagCheck.status === 0) {
  console.error(
    `[rc:firefox] Tag ${tag} already exists locally — pick a higher version.`,
  );
  process.exit(1);
}

// ─── 5. Sync versions across all three files ────────────────────────────────
//      Mirrors .github/workflows/release.yml lines 64-83 exactly so local
//      and CI release paths produce identical version-sync commits.
const versionedFiles = [
  "package.json",
  "src/manifest/chrome.manifest.json",
  "src/manifest/firefox.manifest.json",
];
console.log(`\n→ Syncing version → ${version}`);
let bumped = false;
for (const rel of versionedFiles) {
  const p = path.join(root, rel);
  const json = JSON.parse(fs.readFileSync(p, "utf-8"));
  if (json.version === version) {
    console.log(`  ${rel} already at ${version}`);
    continue;
  }
  json.version = version;
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ${rel} → ${version}`);
  bumped = true;
}

// ─── 6. Run pipeline; revert bump on failure ────────────────────────────────
function revertBump() {
  if (!bumped) return;
  console.error(`[rc:firefox] Reverting version bump.`);
  spawnSync("git", ["checkout", "--", ...versionedFiles], {
    cwd: root,
    stdio: "inherit",
  });
}

function runStep(name) {
  console.log(`\n→ ${name}`);
  const r = spawnSync("pnpm", ["run", name], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n[rc:firefox] Step "${name}" failed (exit ${r.status}).`);
    revertBump();
    process.exit(r.status ?? 1);
  }
}

runStep("build:firefox");
runStep("package:firefox");
runStep("sign:firefox");

// ─── 7. Commit + tag (local only) ───────────────────────────────────────────
if (bumped) {
  console.log(`\n→ Committing version sync`);
  spawnSync("git", ["add", ...versionedFiles], { cwd: root, stdio: "inherit" });
  const commit = spawnSync(
    "git",
    ["commit", "-m", `chore: release ${version}`],
    { cwd: root, stdio: "inherit" },
  );
  if (commit.status !== 0) {
    console.error(`[rc:firefox] git commit failed — leaving version bump staged.`);
    process.exit(commit.status ?? 1);
  }
} else {
  console.log(
    `\n  (No version bump to commit — files were already at ${version}.)`,
  );
}

console.log(`\n→ Creating annotated tag ${tag}`);
const tagResult = spawnSync(
  "git",
  ["tag", "-a", tag, "-m", `Release ${tag}`],
  { cwd: root, stdio: "inherit" },
);
if (tagResult.status !== 0) {
  console.error(`[rc:firefox] git tag failed.`);
  process.exit(tagResult.status ?? 1);
}

console.log(`\n✓ Tagged locally as ${tag}.`);
console.log(`  Push the commit:  git push origin HEAD`);
console.log(`  Push the tag:     git push origin ${tag}\n`);
