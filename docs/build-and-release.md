# Build and release

How sources turn into loadable extensions, packaged artifacts, and signed releases. One pipeline; the only difference between a local build and a CI release is who triggers it.

## Build

The build is orchestrated by `scripts/build.mjs`, **not** by `vite.config.ts`. Vite alone can't emit four entry points in three formats — content scripts can't load ES modules, Chrome's service worker must be a module, Firefox's background is an IIFE. The script runs multiple Vite passes:

```sh
TARGET=chrome   node scripts/build.mjs    # → dist/chrome/
TARGET=firefox  node scripts/build.mjs    # → dist/firefox/
```

| Pass | Entry | Format | Output |
| --- | --- | --- | --- |
| 1 | `options.html` (uses `vite.config.ts` — Preact + Tailwind plugins) | HTML + JS bundle | `options.html`, `options.js`, assets |
| 2 | `src/content/index.ts` | IIFE | `content.js` |
| 3 | `src/inject.ts` | IIFE | `inject.js` |
| 4 | `src/background/<target>.ts` | ES module (Chrome) / IIFE (Firefox) | `background.js` |
| 5 (Firefox only) | `src/content/loader.ts` | IIFE | `loader.js` |

After the Vite passes, the script copies the per-target manifest (`src/manifest/<target>.manifest.json`), patches its `version` from `package.json`, then copies `public/*` assets verbatim.

`pnpm run build:chrome` and `build:firefox` wrap the script with a `tsc -b` pre-step. `pnpm run build` runs both targets sequentially.

`pnpm run dev:chrome` runs `scripts/build.mjs --watch` for an incremental rebuild loop; reload the extension in `chrome://extensions` to pick up changes.

## Manifest divergence

Both manifests live at `src/manifest/{chrome,firefox}.manifest.json`. The `version` field is overwritten by `build.mjs` from `package.json` — never edit it directly outside the release flow. Major divergences:

| Concern | Chrome | Firefox |
| --- | --- | --- |
| Background | `service_worker: "background.js"`, `type: "module"` | `scripts: ["background.js"]`, IIFE |
| Content scripts | Two entries: `content.js` on both domains at `document_start`; `inject.js` on Instagram with `world: "MAIN"` | One entry: `content.js` + `loader.js` on both domains at `document_idle` |
| Permissions | `storage`, `unlimitedStorage`, `downloads` | + `webRequest` (Firefox-only XHR-capture stub in `src/background/firefox.ts`) |
| Threads bridge | `externally_connectable.matches: ["*://*.threads.com/*"]` | Not declared (no Firefox equivalent) |
| Options entry | `options_page: "options.html"` | `options_ui: { page, open_in_tab: true }` |
| Add-on identity | — | `browser_specific_settings.gecko.id`, `strict_min_version: "115.0"` |

`web_accessible_resources` exposes `inject.js` to both domains in both manifests — needed for Firefox's loader.js path and for the inject script's MAIN-world execution under Chrome's CSP.

## Package

`pnpm run package:<target>` produces a distributable artifact:

- **Chrome** → `artifacts/igdl-chrome-<version>.zip`. A flat zip of `dist/chrome/.` (root-level `manifest.json`, as the Chrome Web Store requires).
- **Firefox** → `artifacts/igdl-firefox-<version>.zip` produced by `web-ext build` from `dist/firefox/`. (`web-ext` insists on a `.zip` extension; the release pipeline renames or signs it as needed.)

Run `pnpm run build:<target>` first.

## Sign Firefox

`pnpm run sign:firefox` calls `web-ext sign` against AMO, producing a signed `.xpi`. Required env vars (browser-prefixed contract — never use the `WEB_EXT_*` names directly):

| Env var | What it is |
| --- | --- |
| `FIREFOX_API_KEY` | AMO JWT issuer. Generate at <https://addons.mozilla.org/developers/addon/api/key/>. |
| `FIREFOX_API_SECRET` | AMO JWT secret (paired with the key above). |
| `FIREFOX_CHANNEL` | `unlisted` (default; self-distribution, signs synchronously) or `listed` (AMO public catalog, queues for review). Override per-run with `--channel=listed`. |

`scripts/sign-firefox.mjs` translates `FIREFOX_*` to the `WEB_EXT_*` names internally and passes them via env (never CLI args — process arg lists are world-readable on Linux). It also renames AMO's downloaded XPI to `igdl-firefox-<version>.xpi` so the artifact name matches the convention.

When AMO rejects the upload because the version already exists, the script exits with code `2` — that's a sentinel `rc:firefox` watches for to decide whether to bump-and-retry.

Credentials live in `.env` at the repo root (gitignored) for local use; CI reads them from GitHub Secrets.

## Local release pipeline (rc:firefox)

`pnpm run rc:firefox [version] [--flags]` is the local end-to-end Firefox release command. It:

1. Picks a version (precedence: positional CLI arg > `FIREFOX_RC_VERSION` env > auto-bumped patch from `package.json`). Auto-bump mode advances past any locally tagged versions.
2. Runs pre-flight checks: semver valid, env vars set, working tree clean, `v<version>` tag doesn't exist locally.
3. Syncs the version into `package.json`, `src/manifest/chrome.manifest.json`, and `src/manifest/firefox.manifest.json`.
4. Runs `build:firefox` → `package:firefox` → `sign:firefox`.
5. On AMO version conflict (sign exit code 2): bumps per `--incrementOnConflict={major|minor|patch}` (default `patch`) and retries from the build step. `--errorOnVersionConflict` opts out.
6. On any non-conflict failure: reverts the version bump (`git checkout -- <files>`) so the working tree is clean for re-run.
7. On success: creates a `release: <version>` commit and a `v<version>` annotated tag. **The tag is not pushed automatically** — push it manually when you're satisfied with the build.

## CI release pipeline

`.github/workflows/release.yml` is the only workflow. Triggered manually via `workflow_dispatch` with a `version` input (semver, no `v` prefix). Steps:

1. Validate the version regex.
2. Confirm `v<version>` doesn't already exist on `origin`.
3. Sync the version into `package.json` + both manifests (inline Node script).
4. `pnpm run lint && pnpm run typecheck && pnpm run test`.
5. `pnpm run build:chrome && pnpm run build:firefox`.
6. `web-ext lint dist/firefox`.
7. `pnpm run package:chrome && pnpm run package:firefox`. Rename the Firefox artifact from `igdl-<version>.zip` to `igdl-firefox-<version>.zip`.
8. `pnpm run sign:firefox` (env: `FIREFOX_API_KEY`, `FIREFOX_API_SECRET` from `secrets.*`).
9. Commit the version sync (if anything changed) as `chore: release <version>`, push, then push the annotated tag.
10. Create a GitHub Release via `softprops/action-gh-release@v2` with auto-generated notes and the three artifacts attached: Chrome zip, Firefox zip, Firefox signed XPI.

There is no separate per-PR pipeline — pre-push hooks cover that locally.

## Husky and lint-staged

`prepare` (run by pnpm post-install) wires up two Git hooks:

- **`pre-commit`** → `npx lint-staged`. Per `.lintstagedrc.mjs`:
  - `*.{js,jsx,ts,tsx}` → `eslint --cache --fix`, `prettier --write`, then `npm run test` (the full unit suite).
  - `*.{json,md,css}` → `prettier --write`.
- **`pre-push`** → `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run test:storybook`. The Storybook run uses Playwright in headless Chromium — slow, but it's the gate for visual regressions and a11y issues.

Both hooks bypass via `--no-verify` is **not** acceptable in normal flow; see CLAUDE.md.

## web-ext config

`web-ext.config.mjs` at the repo root is read by every `web-ext run|build|lint|sign` invocation:

```js
{
  sourceDir: "./dist/firefox",
  artifactsDir: "./artifacts",
  build: { overwriteDest: true },
  run: { startUrl: ["about:debugging#/runtime/this-firefox"], browserConsole: true },
  ignoreFiles: ["package.json", "pnpm-lock.yaml", "*.map"],
}
```

`pnpm run dev:firefox` uses the `run.*` block; `pnpm run package:firefox` uses `build.*`; `pnpm run sign:firefox` overrides the source dir explicitly.

## Storybook + Chromatic

- `pnpm run storybook` — local dev server, port 6006.
- `pnpm run build-storybook` — static build (used by Chromatic).
- `pnpm run chromatic` — uploads to Chromatic for visual review. Project token is in the `package.json` script. Not part of the release pipeline; runs ad-hoc.

## Release checklist

For a release worth cutting:

1. Working tree clean. All in-flight PRs merged.
2. Bump the version: either let `rc:firefox` auto-bump or pick one explicitly.
3. **Local dry-run** (recommended): `pnpm run rc:firefox -- --channel=unlisted`. This signs as unlisted (self-distribution) so you don't burn a listed-channel review for a smoke test.
4. Test the unpacked builds in both browsers.
5. Trigger the GitHub Actions `Release` workflow with the same version; it produces the Chrome zip + signed Firefox XPI on the GitHub Release page.
6. (If listed-channel) submit the Firefox XPI to AMO via the workflow's signed artifact, or re-run `sign:firefox -- --channel=listed` locally.
