# Development

Setup, common commands, and where things live. For the rules everyone has to follow, see `../CLAUDE.md`.

## Prerequisites

- **Node 20+** and **pnpm 9+** (the project is npm/yarn-incompatible — pnpm only).
- A Chromium browser and Firefox for testing both targets.

## Setup

```sh
pnpm install
```

The `prepare` script wires up Husky hooks on install. Pre-commit runs lint-staged; pre-push runs the full lint + typecheck + unit + Storybook test suite.

## Day-to-day commands

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Vite dev server for the options page only (HMR). The fastest loop for UI work. |
| `pnpm run dev:chrome` | Watches sources and rebuilds the unpacked Chrome extension into `dist/chrome/`. Reload the extension in `chrome://extensions` to pick up changes. |
| `pnpm run dev:firefox` | Launches Firefox with `web-ext run` against `dist/firefox/`. Run a build first. Won't work from WSL2 — see below. |
| `pnpm run dev:firefox:win` | WSL2 helper: rebuilds and copies `dist/firefox/` to `C:\temp\igdl-ext` so a Windows-side Firefox can sideload it. |
| `pnpm run build:chrome` / `build:firefox` / `build` | Typecheck + multi-entry Vite build. See `build-and-release.md`. |
| `pnpm run lint` | ESLint with `--fix`. Zero warnings is required. |
| `pnpm run typecheck` | `tsc -b`, strict. |
| `pnpm run test` | Vitest unit suite (jsdom). |
| `pnpm run test:storybook` | Storybook component tests via Vitest + Playwright (Chromium). Slow; pre-push runs it. |
| `pnpm run storybook` | Storybook dev server on port 6006. |

## Loading the unpacked build

**Chrome / Edge**: visit `chrome://extensions`, enable Developer Mode, **Load unpacked**, point at `dist/chrome/`.

**Firefox**: visit `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on**, pick `dist/firefox/manifest.json`. Firefox unloads temporary add-ons on browser restart — `pnpm run dev:firefox` is more convenient for active work.

### WSL2 quirk

`web-ext run` can't read files over `\\wsl.localhost\` paths, so `pnpm run dev:firefox` won't launch a Windows-side Firefox against your WSL working tree. Use `pnpm run dev:firefox:win` instead — it watches and copies `dist/firefox/` to `C:\temp\igdl-ext\` on every change. Load that path once in `about:debugging` and click **Reload** on each rebuild.

### Firefox manifest gotcha

Don't paste Chrome-only manifest keys (e.g. `externally_connectable`, `content_scripts[].world`) into `firefox.manifest.json`. Firefox parses the manifest, logs a warning, and **silently refuses to inject the content script** — there's no surfaced error, just nothing happens. Keep both manifests strictly to keys their target supports.

## Where things live

```
src/
  background/      MV3 service worker (chrome.ts) and background script (firefox.ts).
                   Shared handlers live in background/shared/.
  content/         Isolated-world content script. Handlers per Instagram route in
                   content/handlers/, extractors in content/extractors/, injected UI
                   in content/modals/ + content/toasts/, Threads-specific code in
                   content/threads/. Inline-token styles in content/tokens.ts.
  inject.ts        MAIN-world page-context script. Installs the XHR/fetch interceptor
                   from src/xhr.ts. See content-script.md.
  manifest/        chrome.manifest.json + firefox.manifest.json (kept in lockstep
                   except for browser-specific keys).
  options/         Preact options page (multi-card layout). Cards in components/cards/,
                   modals in components/modals/.
  services/        SettingsService (storage monopoly), MediaCacheService, DownloadService,
                   ZipService, ThemeService, ToastService. One folder per service. See
                   services/<name>.md for each.
  stories/         Storybook source-of-truth for the design system.
  types/           Shared TypeScript types — Settings, MediaResource, Message union,
                   media-cache cache-entry shapes.
  utils/           Cross-context helpers — sendMessage wrapper, path/date utils.
```

Tests live next to source in `__tests__/` (`*.spec.ts(x)`). Stories live in `__stories__/`.

## Reading order for new contributors

1. `../CLAUDE.md` — hard rules (zero border-radius, Shadow DOM isolation, SettingsService monopoly, message-bus typing, manifest parity).
2. `architecture.md` — module boundaries and the message + storage flow.
3. `download-flow.md` — the click-to-file trace touches almost every layer in one shot.
4. `services/settings.md` — the highest-traffic service, useful as a model for the rest.
