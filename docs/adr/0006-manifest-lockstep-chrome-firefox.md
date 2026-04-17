# 0006 — Two manifests in lockstep (Chrome + Firefox)

- Status: accepted
- Date: 2026-02-01

## Context

MV3 is supposedly cross-browser, but Chrome and Firefox have meaningful manifest differences that can't be papered over:

| Field                         | Chrome                          | Firefox                                   |
| ----------------------------- | ------------------------------- | ----------------------------------------- |
| `background`                  | `service_worker` + `type: module` | `scripts` (array, no module support)    |
| `content_scripts` world       | `"world": "MAIN"` supported      | Not supported                             |
| Options surface               | `options_page`                   | `options_ui` (inline panel or new tab)   |
| Extra permissions             | —                                | `webRequest`, `webRequestBlocking`, `webRequestFilterResponse` |
| AMO / gecko metadata          | —                                | `browser_specific_settings.gecko` required |

A single shared manifest with codegen was considered. The tooling is non-trivial (either hand-rolled or a build-time macro system like `json-stringify` templating), and the divergences are small — six fields out of 30+. Codegen would hide the divergences rather than surface them.

## Decision

Keep two manifest files side-by-side under `src/manifest/`:

```
src/manifest/chrome.manifest.json
src/manifest/firefox.manifest.json
```

Both are hand-maintained. `scripts/build.mjs` picks the right one based on `TARGET=chrome|firefox` and copies it into `dist/<target>/manifest.json` after injecting the `version` from `package.json`.

Rules:

- **Any new permission** must land in both manifests unless it's browser-specific (e.g., Firefox's `webRequest*` trio).
- **Any new host permission** must land in both (host permissions are browser-agnostic).
- **Any new `web_accessible_resources`** entry must land in both.
- **Divergences are allowed** only for the fields in the table above, and each divergence must be explainable — if a field differs, either the browsers don't support the same shape or we're intentionally opting into different behavior.

The `extension-auditor` agent checks manifest parity on any diff touching `src/manifest/`. `pnpm exec web-ext lint --source-dir=dist/firefox` catches Firefox-specific manifest issues (required `browser_specific_settings.gecko`, disallowed keys, etc.).

## Consequences

- **Two files to keep in sync.** The tradeoff is explicit visibility over hidden codegen.
- **Browser-specific divergences are grepable.** Anyone comparing the two files sees the permission list differences immediately.
- **Release-time version sync is a single step** — `scripts/build.mjs` injects the current `package.json` version into each manifest's copy as it writes them; we don't have to update two files in source control. (But if a developer forgets and hand-edits one, the release workflow will commit the drift.)
- **Refactoring content-script entry structure** (`content_scripts` array) requires careful hand-editing of both. The extension-auditor check is the primary safety net.
- **Adding a push/PR CI** would make the `web-ext lint` step gate all changes, not just releases — worth doing if manifest churn increases.
