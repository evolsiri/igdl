/**
 * Shared Firefox signing env helpers used by rc:firefox + sign:firefox.
 *
 * Centralises:
 *   - `.env` loading (shell env always wins)
 *   - the required-env check for AMO signing
 *
 * Single source of truth: when a new required env var is added (e.g. for a
 * future Chrome signing flow, or a different Firefox tool), update this
 * module and both call sites pick it up.
 */

import fs from "node:fs";
import path from "node:path";

/** Load `.env` at `rootDir` into process.env without overwriting shell vars. */
export function loadDotEnv(rootDir) {
  const envFile = path.join(rootDir, ".env");
  if (!fs.existsSync(envFile)) return;
  for (const rawLine of fs.readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Validate that the env vars required for Firefox AMO signing are present.
 * Reports ALL missing keys at once (no fail-on-first) and exits 1 if any
 * are missing. Returns the values otherwise.
 */
export function requireFirefoxSigningEnv() {
  const apiKey = process.env.FIREFOX_API_KEY;
  const apiSecret = process.env.FIREFOX_API_SECRET;
  const missing = [];
  if (!apiKey) missing.push("FIREFOX_API_KEY");
  if (!apiSecret) missing.push("FIREFOX_API_SECRET");
  if (missing.length) {
    console.error(
      [
        `[firefox-env] Missing required env var${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        "",
        "Set them in your shell, or place them in `.env` at the repo root. Generate at:",
        "    https://addons.mozilla.org/developers/addon/api/key/",
      ].join("\n"),
    );
    process.exit(1);
  }
  return { apiKey, apiSecret };
}
