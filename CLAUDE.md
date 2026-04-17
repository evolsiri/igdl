# igdl

Chrome + Firefox MV3 browser extension (Preact + TypeScript + Tailwind v4) that downloads Instagram/Threads media with per-profile directory routing. Heavily inspired by [TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension).

## Stack

- **Language**: TypeScript, strict mode.
- **UI**: Preact only — never React. JSX via `/** @jsxImportSource preact */`.
- **Styling**: Tailwind v4 via `@tailwindcss/vite`. No other CSS framework. Theme tokens as CSS variables in `src/index.css`.
- **Tests**: Vitest + `@testing-library/preact`.
- **Build**: Vite (multi-entry: options, content, background, inject).
- **Package manager**: pnpm — never npm or yarn.

## Commands

- `pnpm run dev`
- `pnpm run lint` (zero warnings required)
- `pnpm run test`
- `pnpm run build:chrome`
- `pnpm run build:firefox`
- `pnpm run build` (both)

## Non-negotiable styling rules

- **Zero border-radius** on every element in all extension UI (options page + injected modals + toasts). Enforced via a global reset.
- **Dark-first** palette. Accent: green (#1ED760 family — brighter green, pairs with black text for ~11:1 contrast in both themes). Default to dark when `prefers-color-scheme: dark`.
- Animations are **CSS transitions only** — no JS animation libraries. Trigger on `:hover`, `:focus`, `:focus-visible`, `:active`, or stateful class changes.
- Theme switching toggles a single root class; never re-renders the tree for theme changes.

## Architecture invariants

- Content scripts **never** call `chrome.downloads.*` directly. They send typed messages to the background worker, which owns all download invocation.
- **All injected UI** (modals, toasts, anything content-script-rendered) mounts inside a **Shadow DOM** so Tailwind styles don't leak into Instagram and Instagram styles don't leak in.
- **All storage access** (read + write) goes through `SettingsService`. Direct `chrome.storage.*` calls outside `src/services/settings/` are prohibited.
- `ThemeService` toggles a root class only; it persists via `SettingsService`, never direct storage.
- Messages between content ↔ background are typed via the union in `src/types/messages.ts`. Send them via the wrapper in `src/utils/messages.ts`, not raw `chrome.runtime.sendMessage`.

## File layout

- **Preact components (options page)**: `src/options/components/` (cards under `cards/`, modals under `modals/`).
- **Preact components (injected)**: `src/content/modals/` and `src/content/toasts/`.
- **Utilities**: `src/utils/`.
- **Services**: `src/services/<name>/<name>.ts` — lowercase/kebab folder, primary entry file named to match the folder (no `index.ts` barrels). Tests co-located in `src/services/<name>/__tests__/<name>.spec.ts(x)`. See `docs/code-style-guide.md`.
- **Types**: `src/types/`.
- **Manifests**: `src/manifest/chrome.manifest.json` and `src/manifest/firefox.manifest.json`.

## Docs contract

- Every service in `src/services/*` has a matching `docs/services/<name>.md` (same lowercase/kebab name as the service folder).
- Every Preact component in `src/options/components/cards|modals/`, `src/content/modals/`, `src/content/toasts/` has a matching `docs/components/<Name>.md`.
- `docs/README.md` is the index; keep it synced.
- `docs/architecture.md` describes module boundaries, message flow, and storage flow.
- `docs/design-system.md` indexes the design system. Source of truth is the `Design System/*` Storybook story at `src/stories/DesignSystem.stories.tsx` — any new colour token, motion value, typography size, or component must update the story's corresponding array in the same PR.

## TSDoc contract

Every public service method needs a TSDoc block stating:

1. What it does.
2. How it's used, with at least one example.

## Manifest rules (MV3)

- Both `chrome.manifest.json` and `firefox.manifest.json` stay in lockstep.
- Host permissions: `https://www.instagram.com/*` and `https://www.threads.com/*` only.
- Permissions: `storage`, `unlimitedStorage`, `downloads`, `scripting` (+ `contextMenus` if used).
- `action.default_popup` is **not** set; toolbar icon opens `options.html` via `chrome.runtime.openOptionsPage()`.
- `options_page: "options.html"`.

## Filename + download defaults

- Template: `{username}-{id}-{datetime}`.
- Datetime: `YYYYMMDD_HHmmss`.
- `.jpeg` → `.jpg` replacement on.
- Carousel indexing on.
- Downloads are relative to the browser's Downloads folder; a global "Always prompt Save As" toggle overrides.

## Reference extension

Source for parity behavior + selectors: `https://github.com/TheKonka/instagram-download-browser-extension`. Port handlers directly but route all downloads through `DownloadService` + the background worker.

## Subagent routing

When a task crosses domains, delegate to the right specialist rather than doing it all in the main session. Prefer the project-local agent when it overlaps a global one — it knows igdl invariants.

| Concern                                        | Agent                                        |
| ---------------------------------------------- | -------------------------------------------- |
| General code review (5-axis + igdl invariants) | `code-reviewer` (project-local)              |
| Visual + interaction design                    | `ux-reviewer` (project-local)                |
| Docs coverage + TSDoc                          | `documentation-reviewer` (project-local)     |
| MV3 + Chrome/Firefox parity                    | `extension-auditor` (project-local)          |
| WCAG / keyboard / screen-reader a11y           | `voltagent-qa-sec:accessibility-tester`      |
| Deep security audit                            | `voltagent-qa-sec:security-auditor`          |
| Perf profiling + bottleneck analysis           | `voltagent-qa-sec:performance-engineer`      |
| TDD workflow                                   | `agent-skills:test`                          |
| Test framework + CI integration                | `voltagent-qa-sec:test-automator`            |
| Advanced TypeScript                            | `voltagent-lang:typescript-pro`              |
| Preact / component patterns                    | `voltagent-lang:react-specialist`            |
| Browser debugging + DOM inspection             | `agent-skills:browser-testing-with-devtools` |
| Codebase exploration                           | `Explore` agent                              |
| Implementation planning                        | `Plan` agent                                 |

The four project-local reviewers compose. On a meaty diff, run `code-reviewer`, `ux-reviewer`, `documentation-reviewer`, and `extension-auditor` in parallel (single message, multiple tool calls) rather than sequentially — their scopes don't overlap.
