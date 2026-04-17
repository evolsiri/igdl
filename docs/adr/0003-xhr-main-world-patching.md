# 0003 — Page-world XHR / fetch patching

- Status: accepted
- Date: 2026-02-01

## Context

Instagram serves most media URLs — especially videos — as short-lived, session-scoped signed URLs that never appear in the DOM. They only exist in the JSON response bodies of internal API calls (`/api/v1/feed/timeline/`, `/api/v1/media/<id>/info/`, etc.).

To download media, the extension needs those URLs. The options considered:

1. **Parse the DOM.** Insufficient — videos in particular aren't in the DOM as URLs; the `<video>` element's `src` is a blob URL generated at play time from the signed URL.
2. **Make our own API calls** mirroring Instagram's. Requires reverse-engineering auth (app IDs, cookies, tokens that may change) and is brittle against server-side changes.
3. **Proxy requests through the background worker.** The background has `chrome.webRequest` on Firefox (but not on Chrome's MV3 with declarativeNetRequest-only policy), and even then reading response bodies requires `filterResponseData` which is Firefox-only.
4. **Patch `XMLHttpRequest` and `fetch` in the page's own JavaScript runtime.** The most reliable — Instagram's requests go through patched APIs, and we read response bodies directly.

The reference extension ([TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension)) proved approach #4 works cross-browser. Content scripts run in an **isolated world** with their own prototypes, so we must install the patch in the page's main world.

## Decision

`src/xhr.ts` exports `installXhrInterceptor({ onSnapshot })` which monkey-patches `XMLHttpRequest.prototype.open/send` + `globalThis.fetch`. `src/inject.ts` is the page-world entry: it calls `installXhrInterceptor` and forwards each snapshot to the isolated content script via `window.postMessage` with `source: "igdl-xhr"`.

The two browsers load `inject.js` into the page world differently:

- **Chrome MV3**: `content_scripts` entry with `"world": "MAIN"` at `document_start`.
- **Firefox MV3**: doesn't support `world: "MAIN"`. A regular isolated-world content script (`src/content/loader.ts`) `<script>`-injects `inject.js` from `web_accessible_resources`.

Captured snapshots are handed to `MediaCacheService.ingestXhrSnapshot`, which dispatches by URL substring into the matching cache key. Handlers later read through the cache with `resolveMediaFor*` methods.

An idempotency sentinel (`__igdl_xhr_installed__`) guards against double-installation.

## Consequences

- **We can intercept any JSON response Instagram's own page code receives.** New cache keys are cheap — add an endpoint-substring case to `ingestXhrSnapshot`.
- **`src/xhr.ts` must never use `chrome.*` APIs** — they aren't available in the page world.
- **Errors are swallowed inside the patch.** We can never throw into Instagram's call stack; silent failure is preferred over breaking Instagram.
- **Firefox has a second fallback path** planned (`webRequest.filterResponseData` in `src/background/firefox.ts`) because `<script>`-injection can race Instagram's in-flight requests.
- **Tests** use `src/__tests__/xhr.spec.ts` to exercise patching in jsdom; no real XHR is made.
- **This is the single biggest source of "why doesn't Chrome work the same as Firefox?" complexity** in the codebase. Keeping both paths testable is worth the investment.
