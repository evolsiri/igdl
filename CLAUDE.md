# igdl

Chrome + Firefox MV3 extension that adds a download button to Instagram and
Threads with per-profile directory routing. Preact + TypeScript + Tailwind v4.

For everything beyond the rules below, the code is canonical and `docs/` is
the map. Start at `docs/architecture.md`, then `docs/code-style-guide.md`.

## Hard rules

Violating any of these will fail review:

- **Preact, not React.** JSX uses `/** @jsxImportSource preact */`; hooks come
  from `preact/hooks`. Importing `react` is a lint error.
- **pnpm only.** Never npm or yarn.
- **Zero border-radius** on every UI element (options page + injected modals
  + toasts). Enforced by the global reset in `src/index.css`. SVG `rx` on
  brand glyphs is the sanctioned opt-out.
- **CSS animations only.** No JS animation libraries.
- **Storage is owned by `src/services/settings/storage.ts`.** Every consumer
  goes through the `KvStorage` adapter. `SettingsService` and
  `MediaCacheService` are the only two clients.
- **Downloads are owned by `src/background/shared/downloads.ts`.** Content
  scripts and the options page send `DOWNLOAD_MEDIA` via `DownloadService`.
  The carousel ZIP path (`src/services/zip/`, anchor-click on a blob) is the
  one deliberate exception.
- **Cross-context messaging goes through `src/utils/messages.ts`** (sender)
  and `src/background/shared/router.ts` (receiver), typed against the union
  in `src/types/messages.ts`. Never raw `chrome.runtime.sendMessage`. Never
  throw across the boundary — surface failures as `{ ok: false, error }`.
- **All injected UI mounts in a Shadow DOM** via `createShadowMount()`
  (`src/content/modals/mount.ts`). Tailwind does not reach the shadow root;
  injected components style themselves from `src/content/tokens.ts`.
- **No `innerHTML` on Instagram-derived content. No `eval`, no `Function(…)`,
  no dynamic `<script>` insertion.**
- **Manifest parity.** `src/manifest/chrome.manifest.json` and
  `firefox.manifest.json` stay in lockstep modulo browser-specific keys.
  Host permissions are `instagram.com` + `threads.com` only. The Firefox
  manifest silently drops content-script injection if Chrome-only keys leak
  in — see `docs/architecture.md` and `docs/development.md`.

## Docs + TSDoc contract

- Every service in `src/services/<name>/` has `docs/services/<name>.md`.
- Every public service method has a TSDoc block stating what it does plus at
  least one runnable `@example`.
- Component documentation lives as a TSDoc-style doc block **above the
  component in its `.tsx` file** — there is no `docs/components/` directory.
- `docs/README.md` indexes everything in `docs/`. Architectural decisions
  belong in commit messages, PR descriptions, or comments next to the code.
  No ADR directory.

## Project README contract

The top-level `README.md` is the product's storefront, not a contributor
doc. Voice, audience, scope, and smell-tests are defined in
[`docs/project-readme.md`](./docs/project-readme.md). Accuracy of links
and structural coverage stays with `documentation-reviewer`; this rule
covers tone and what-belongs-where only. Applies only to `/README.md` —
`docs/README.md` and per-service docs are out of scope.

## Design system

`src/stories/DesignSystem.stories.tsx` is the source of truth for tokens,
motion, typography, and the component inventory. New tokens / components
must update the matching array in the story in the same PR. The canonical
token values live in `src/index.css` (options page) and
`src/content/tokens.ts` (injected UI); see [`docs/design-system.md`](./docs/design-system.md)
for the contract.

## Subagent routing

| Concern                                           | Agent                                        |
| ------------------------------------------------- | -------------------------------------------- |
| Five-axis review + igdl invariants                | `code-reviewer`                              |
| Visual / interaction / design-system parity       | `ux-reviewer`                                |
| Docs coverage + TSDoc                             | `documentation-reviewer`                     |
| MV3 manifest, SW lifecycle, Chrome/Firefox parity | `extension-auditor`                          |
| Scaffold a new service or component               | `service-implementer`                        |
| Instagram DOM / selector / XHR-bridge fixes       | `instagram-dom-engineer`                     |
| Release: version bump, sign, tag                  | `release-engineer`                           |
| `.claude/` config / agent-file drift              | `claude-config-reviewer`                     |
| WCAG / screen-reader audit                        | `voltagent-qa-sec:accessibility-tester`      |
| Threat-modeling / supply-chain audit              | `voltagent-qa-sec:security-auditor`          |
| Content-script perf / memory regressions          | `voltagent-qa-sec:performance-engineer`      |
| Runtime verification (Chrome / Firefox)           | `chrome-devtools-mcp:chrome-devtools`        |
| Codebase exploration                              | `Explore`                                    |
| Implementation planning                           | `Plan`                                       |

The four reviewers compose: on a non-trivial diff, run them in parallel
(single message, multiple tool calls). The three implementers are
single-purpose — pick one, then run the relevant reviewers afterward.

For the canonical path → agent map, co-ownership rules, and the hand-off
graph, see [`.claude/agents/README.md`](./.claude/agents/README.md). The
table above is concern-keyed; the README is path-keyed.
