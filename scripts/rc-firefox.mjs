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
 * Conflict-recovery flags (govern what happens when AMO rejects with
 * "Version X already exists." — exit code 2 from sign:firefox):
 *   --errorOnVersionConflict           Fail immediately on conflict (no retry).
 *   --incrementOnConflict=<component>  Which semver component to bump on
 *                                      conflict-retry: major | minor | patch.
 *                                      Default: patch. Ignored when
 *                                      --errorOnVersionConflict is set.
 *
 * Pre-flight (fails fast, in this order, before doing any work):
 *   1. resolved version is valid semver
 *      (auto-bump mode also advances past any locally-tagged versions
 *       before this point, so the candidate is always tag-free)
 *   2. all required env vars set (via shared firefox-env)
 *   3. working tree is clean (`git status --porcelain` empty)
 *   4. tag `v<version>` does not exist locally
 *      (only fires for explicit CLI / FIREFOX_RC_VERSION inputs;
 *       auto-bump never reaches this guard)
 *
 * Pipeline:
 *   sync versions in package.json + both manifests
 *     → build:firefox → package:firefox → sign:firefox
 *   On AMO version conflict (exit 2): bump per --incrementOnConflict and
 *   re-run from build (because dist/firefox/manifest.json carries the version).
 *
 * On any non-conflict pipeline-step failure: reverts the version bump
 * (`git checkout -- <files>`) so the working tree is clean for re-run.
 *
 * On success: creates `chore: release <version>` commit + annotated
 * `v<version>` tag locally. Tag push is intentionally NOT automatic.
 *
 * Usage:
 *   pnpm run rc:firefox                                          # auto-bump patch
 *   pnpm run rc:firefox -- 1.5.0                                 # explicit CLI override
 *   FIREFOX_RC_VERSION=1.5.0 pnpm run rc:firefox                 # env override
 *   pnpm run rc:firefox -- --errorOnVersionConflict              # fail on AMO conflict
 *   pnpm run rc:firefox -- --incrementOnConflict=minor           # bump minor on conflict
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, requireFirefoxSigningEnv } from "./lib/firefox-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const EXIT_VERSION_CONFLICT = 2; // matches sign-firefox.mjs sentinel
const MAX_CONFLICT_RETRIES = 50; // safety cap; should never be approached
const MAX_AUTOBUMP_ADVANCES = 100; // cap on "advance past tagged versions" loop

function localTagExists(t) {
  return (
    spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${t}`], {
      cwd: root,
      stdio: "ignore",
    }).status === 0
  );
}

// ─── 1. Parse flags + positional version ────────────────────────────────────
//      pnpm 9 forwards the `--` separator literally; strip it so callers can
//      use either `pnpm run rc:firefox -- 1.0.4` or `pnpm run rc:firefox 1.0.4`.
const rawArgs = process.argv.slice(2).filter((a) => a !== "--");

let errorOnVersionConflict = false;
let incrementOnConflict = "patch";
const positional = [];
for (const arg of rawArgs) {
  if (arg === "--errorOnVersionConflict") {
    errorOnVersionConflict = true;
  } else if (arg.startsWith("--incrementOnConflict=")) {
    const value = arg.slice("--incrementOnConflict=".length);
    if (value !== "major" && value !== "minor" && value !== "patch") {
      console.error(
        `[rc:firefox] --incrementOnConflict must be one of major|minor|patch (got "${value}").`,
      );
      process.exit(1);
    }
    incrementOnConflict = value;
  } else if (arg.startsWith("--")) {
    console.error(`[rc:firefox] Unknown flag "${arg}".`);
    process.exit(1);
  } else {
    positional.push(arg);
  }
}

function readPkgVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf-8"),
  );
  return pkg.version;
}

/** Bump the given semver string by the named component. Lower components reset. */
function bumpVersion(v, component) {
  const m = v.match(SEMVER);
  if (!m) {
    console.error(`[rc:firefox] Cannot bump non-semver version "${v}".`);
    process.exit(1);
  }
  const [, maj, min, pat] = m;
  if (component === "major") return `${Number(maj) + 1}.0.0`;
  if (component === "minor") return `${maj}.${Number(min) + 1}.0`;
  return `${maj}.${min}.${Number(pat) + 1}`;
}

let version;
let versionSource;
if (positional[0]) {
  version = positional[0];
  versionSource = "CLI arg";
} else if (process.env.FIREFOX_RC_VERSION) {
  version = process.env.FIREFOX_RC_VERSION;
  versionSource = "FIREFOX_RC_VERSION env";
} else {
  version = bumpVersion(readPkgVersion(), "patch");
  versionSource = "auto-bumped patch";
}

if (!SEMVER.test(version)) {
  console.error(
    `[rc:firefox] Invalid version "${version}" (from ${versionSource}) — must be semver (e.g. 1.0.4).`,
  );
  process.exit(1);
}

// Auto-bump past locally-tagged versions when in auto-bump mode. Only the
// auto-bump path advances past tag conflicts; CLI / FIREFOX_RC_VERSION are
// treated as explicit user intent and hard-fail on tag conflict (handled
// later in the pre-flight section).
if (versionSource === "auto-bumped patch") {
  let advances = 0;
  while (localTagExists(`v${version}`)) {
    advances += 1;
    if (advances > MAX_AUTOBUMP_ADVANCES) {
      console.error(
        `[rc:firefox] Auto-bump exhausted: ${MAX_AUTOBUMP_ADVANCES} consecutive versions are tagged locally. Investigate manually.`,
      );
      process.exit(1);
    }
    const next = bumpVersion(version, "patch");
    console.log(
      `[rc:firefox]   v${version} already tagged locally → advancing to ${next}`,
    );
    version = next;
  }
}

console.log(`[rc:firefox] Target version: ${version} (${versionSource})`);
if (errorOnVersionConflict) {
  console.log(`[rc:firefox] Conflict policy: --errorOnVersionConflict (no retry)`);
} else {
  console.log(`[rc:firefox] Conflict policy: bump ${incrementOnConflict} and retry`);
}

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

// ─── 4. Pre-flight: initial tag does not already exist locally ──────────────
//      The auto-bump path already advanced past any local tag, so this only
//      fires for explicit CLI / FIREFOX_RC_VERSION inputs.
if (localTagExists(`v${version}`)) {
  console.error(
    `[rc:firefox] Tag v${version} already exists locally — pick a higher version.`,
  );
  process.exit(1);
}

// ─── 5. Pipeline (with conflict-retry loop) ─────────────────────────────────
const versionedFiles = [
  "package.json",
  "src/manifest/chrome.manifest.json",
  "src/manifest/firefox.manifest.json",
];

/** Write target version into all version-bearing JSON files. */
function syncVersionFiles(target) {
  let changed = false;
  console.log(`\n→ Syncing version → ${target}`);
  for (const rel of versionedFiles) {
    const p = path.join(root, rel);
    const json = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (json.version === target) {
      console.log(`  ${rel} already at ${target}`);
      continue;
    }
    json.version = target;
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
    console.log(`  ${rel} → ${target}`);
    changed = true;
  }
  return changed;
}

/** Restore versioned files to HEAD. */
function revertBump() {
  console.error(`[rc:firefox] Reverting version bump.`);
  spawnSync("git", ["checkout", "--", ...versionedFiles], {
    cwd: root,
    stdio: "inherit",
  });
}

/** Run a pnpm script. Returns its exit status; never exits on its own. */
function runStep(name) {
  console.log(`\n→ ${name}`);
  const r = spawnSync("pnpm", ["run", name], { cwd: root, stdio: "inherit" });
  return r.status ?? 1;
}

let attempt = 0;
let bumpedAny = false;
while (true) {
  attempt += 1;
  if (attempt > MAX_CONFLICT_RETRIES) {
    console.error(
      `[rc:firefox] Aborting: exceeded ${MAX_CONFLICT_RETRIES} conflict retries.`,
    );
    revertBump();
    process.exit(1);
  }

  if (syncVersionFiles(version)) bumpedAny = true;

  const buildStatus = runStep("build:firefox");
  if (buildStatus !== 0) {
    console.error(`\n[rc:firefox] Step "build:firefox" failed (exit ${buildStatus}).`);
    revertBump();
    process.exit(buildStatus);
  }
  const packageStatus = runStep("package:firefox");
  if (packageStatus !== 0) {
    console.error(`\n[rc:firefox] Step "package:firefox" failed (exit ${packageStatus}).`);
    revertBump();
    process.exit(packageStatus);
  }
  const signStatus = runStep("sign:firefox");
  if (signStatus === 0) break; // success — exit loop

  if (signStatus === EXIT_VERSION_CONFLICT && !errorOnVersionConflict) {
    const next = bumpVersion(version, incrementOnConflict);
    console.warn(
      `\n[rc:firefox] AMO conflict on ${version} — bumping ${incrementOnConflict} → ${next} and retrying (attempt ${attempt + 1}/${MAX_CONFLICT_RETRIES}).`,
    );
    if (localTagExists(`v${next}`)) {
      console.error(
        `[rc:firefox] Cannot retry: tag v${next} already exists locally. Resolve manually.`,
      );
      revertBump();
      process.exit(1);
    }
    version = next;
    continue;
  }

  if (signStatus === EXIT_VERSION_CONFLICT) {
    console.error(
      `\n[rc:firefox] AMO version conflict and --errorOnVersionConflict was set.`,
    );
  } else {
    console.error(`\n[rc:firefox] Step "sign:firefox" failed (exit ${signStatus}).`);
  }
  revertBump();
  process.exit(signStatus);
}

// ─── 6. Commit + tag (local only) ───────────────────────────────────────────
const tag = `v${version}`;
if (bumpedAny) {
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
