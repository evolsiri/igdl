# Build & Packaging

How `igdl` turns TypeScript sources into loadable Chrome / Firefox extensions and distributable artifacts. The build is orchestrated by two Node scripts, **not** by a single Vite config — multiple entry formats are required (ES module for Chrome's service worker, IIFE for every other entry).

Read this alongside [`release.md`](./release.md), which walks through when and how these commands run in a release.

## Scripts

| Script                           | What it does                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/build.mjs`              | Multi-entry Vite build. Outputs into `dist/<target>/`.                                                   |
| `scripts/package.mjs`            | Zips/pack ages the built `dist/<target>/` into `artifacts/igdl-<browser>-<version>.zip`.                 |

`package.json` exposes them as:
- `pnpm run build:chrome`  → `tsc -b && TARGET=chrome node scripts/build.mjs`
- `pnpm run build:firefox` → `tsc -b && TARGET=firefox node scripts/build.mjs`
- `pnpm run package:chrome`, `pnpm run package:firefox`

## Why multi-entry

The extension has four runtime contexts that can't share a single bundle:

1. **Options page** — DOM + Preact + Tailwind. Needs the Vite options-page pass (HTML + asset pipeline).
2. **Content script** — runs in Instagram's isolated world. No `type="module"` support in MV3 — must be IIFE.
3. **Background** — Chrome is a `service_worker` (ES module, `type: "module"`); Firefox is a `scripts` entry (IIFE).
4. **Inject** — runs in the page's MAIN world. IIFE, loaded as a regular `<script>` tag on Firefox.

So `scripts/build.mjs` runs **one Vite pass per entry**, each configured independently.

## `scripts/build.mjs` — step by step

1. **Clean** `dist/<target>/` — removes any stale files so the output is deterministic.
2. **Options-page pass** — uses `vite.config.ts` (Preact + Tailwind plugins). Produces `options.html`, `assets/*.css`, `assets/*.js`.
3. **Library-mode passes** — one per entry, each producing a single file:
   | Entry      | Source                          | Format                          | Output                   |
   | ---------- | ------------------------------- | ------------------------------- | ------------------------ |
   | content    | `src/content/index.ts`          | IIFE                            | `dist/<target>/content.js`    |
   | inject     | `src/inject.ts`                 | IIFE                            | `dist/<target>/inject.js`     |
   | background | `src/background/<target>.ts`    | ES (Chrome) / IIFE (Firefox)    | `dist/<target>/background.js` |
   | loader     | `src/content/loader.ts`         | IIFE                            | `dist/firefox/loader.js` (Firefox only) |
4. **Manifest copy + version inject** — reads `src/manifest/<target>.manifest.json`, overwrites `version` from `package.json`, writes to `dist/<target>/manifest.json`.
5. **Public assets** — copies everything in `public/` (icons, favicon) into `dist/<target>/`.

## Why Chrome gets ES / Firefox gets IIFE for background

- **Chrome MV3 service workers** must be loaded as modules (`"type": "module"` in the manifest) — they support top-level `import` statements.
- **Firefox MV3 background** uses the `scripts` array and does **not** allow `type: "module"`. A single IIFE bundle is the only workable shape.
- Both targets share every source file under `src/background/shared/` — only the entry file (`chrome.ts` vs `firefox.ts`) differs.

## `scripts/package.mjs` — artifacts

| Target  | Command                        | Output                                       |
| ------- | ------------------------------ | -------------------------------------------- |
| Chrome  | `pnpm run package:chrome`      | `artifacts/igdl-chrome-<version>.zip`        |
| Firefox | `pnpm run package:firefox`     | `artifacts/igdl-<version>.zip` (renamed to `igdl-firefox-<version>.zip` in `release.yml`) |

- Chrome: plain `zip -r` of `dist/chrome/` (Chrome Web Store requires a root-level `manifest.json`).
- Firefox: `web-ext build` handles `.zip`/`.xpi` structure + excludes dev files automatically.

The version embedded in each artifact's filename comes from `package.json`. The release workflow (`release.yml`) is responsible for syncing:

```
package.json.version ─┬─→ dist/chrome/manifest.json.version (build:chrome)
                     └─→ dist/firefox/manifest.json.version (build:firefox)
```

Version **sync** during a release is separate — see [`release.md`](./release.md) § "Commit version sync + tag".

## `dist/<target>/` layout

```
dist/chrome/
├── manifest.json         ← from src/manifest/chrome.manifest.json + injected version
├── background.js         ← ES module, from src/background/chrome.ts
├── content.js            ← IIFE, from src/content/index.ts
├── inject.js             ← IIFE, from src/inject.ts
├── options.html          ← Vite pass
├── assets/*.css + *.js   ← Vite pass
└── favicon.svg etc       ← public/

dist/firefox/
├── manifest.json         ← from src/manifest/firefox.manifest.json
├── background.js         ← IIFE, from src/background/firefox.ts
├── content.js            ← IIFE, from src/content/index.ts
├── inject.js             ← IIFE, from src/inject.ts
├── loader.js             ← IIFE, Firefox-only bootstrap that <script>-injects inject.js
├── options.html
├── assets/
└── favicon.svg etc
```

## Development builds

- `pnpm run dev` — Vite dev server for the options page **only** (fast HMR). Content / background can't be iterated this way; see `dev:chrome`.
- `pnpm run dev:chrome` — watch-mode `scripts/build.mjs` into `dist/chrome/`. Reload unpacked after each change in `chrome://extensions/`.
- `pnpm run dev:firefox` — `web-ext run --source-dir=dist/firefox` auto-reloads a disposable Firefox profile. Requires a prior `build:firefox`.

## Related docs

- [`architecture.md`](./architecture.md) — module boundaries, why the content/background split matters.
- [`ci.md`](./ci.md) — when builds run in CI.
- [`release.md`](./release.md) — where build/package fit in a release cut.
- [`adr/0006-manifest-lockstep-chrome-firefox.md`](./adr/0006-manifest-lockstep-chrome-firefox.md) — why we keep two manifests.
