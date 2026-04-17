# XHR interception layer

Instagram serves most media URLs (especially video) as short-lived, session-scoped signed URLs that are **not** in the DOM — they only live in the response bodies of internal API calls (`/api/v1/feed/timeline/`, `/api/v1/media/<id>/info/`, etc.). To download, the extension has to read those response bodies.

The interception layer patches `XMLHttpRequest` and `fetch` inside the page's own JavaScript runtime, snapshots matching JSON responses, and hands them to `MediaCacheService` where handlers later resolve media by id.

## Two files, one behavior

| File                   | Runs in                         | Role                                                                 |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `src/xhr.ts`           | page world (MAIN)               | Factory `installXhrInterceptor({ onSnapshot })` — patches `XMLHttpRequest` + `fetch`, fires `onSnapshot` on each matching response. Pure; no `chrome.*` usage. |
| `src/inject.ts`        | page world (MAIN)               | Entry point. Calls `installXhrInterceptor` with an `onSnapshot` that forwards each snapshot to the isolated content script via `window.postMessage`. |
| `src/content/loader.ts`| content (isolated world)        | **Firefox-only** — appends a `<script src="inject.js">` to the page so `inject.js` can run in the page world. Chrome uses `content_scripts` with `world: "MAIN"` instead. |
| `src/content/index.ts` | content (isolated world)        | Receives `postMessage` events with `source: "igdl-xhr"` and calls `MediaCacheService.ingestXhrSnapshot`. |

## Why patch in the page world

Content scripts run in an **isolated world** — a separate JavaScript realm with its own `window`, its own prototypes, no access to page-level `XMLHttpRequest.prototype`. Patching `XMLHttpRequest` from the content script would only patch the isolated world's `XMLHttpRequest`, which Instagram never uses.

To intercept Instagram's actual requests, the patch has to run where Instagram's code runs — the page's main world. Every browser exposes this path differently:

- **Chrome MV3**: declare a content script entry with `"world": "MAIN"` in the manifest. The entry runs in the page world at `document_start`.
- **Firefox MV3**: does not support `world: "MAIN"` (as of Firefox 115). The `loader.ts` content script runs in the isolated world and **injects a `<script src="inject.js">` tag** into the document; the browser then loads the script in the page world because `<script>` tags always do. `inject.js` must be listed in `web_accessible_resources` for `chrome.runtime.getURL()` to resolve.

See [`adr/0003-xhr-main-world-patching.md`](./adr/0003-xhr-main-world-patching.md) for the decision record.

## `installXhrInterceptor(options)`

Idempotent — a global sentinel (`__igdl_xhr_installed__`) guards against double-installation when Instagram's code happens to re-evaluate scripts.

### Options

| Field            | Type                                                     | Default                                         |
| ---------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `onSnapshot`     | `(s: XhrSnapshot) => void`                               | required                                        |
| `shouldCapture`  | `(endpoint, contentType) => boolean`                     | content-type contains `"application/json"`      |

### Snapshot shape

```ts
interface XhrSnapshot {
  endpoint: string;  // full URL
  body: unknown;     // parsed JSON
}
```

### What gets patched

- `XMLHttpRequest.prototype.open` — stashes the URL on the XHR instance.
- `XMLHttpRequest.prototype.send` — adds a `"load"` listener; on success, reads `getResponseHeader("content-type")`, runs `shouldCapture`, `JSON.parse(responseText)`, fires `onSnapshot`. Errors are swallowed — page scripts must never see our stack traces.
- `globalThis.fetch` — wraps the original; after the response resolves, clones it and reads JSON asynchronously (fire-and-forget), so we never delay the caller.

## The `inject.js` → content bridge

`src/inject.ts` wires `onSnapshot` to `window.postMessage`:

```ts
installXhrInterceptor({
  onSnapshot: ({ endpoint, body }) => {
    const message: XhrPageMessage = { source: "igdl-xhr", endpoint, body };
    window.postMessage(message, window.location.origin);
  },
});
```

The content script listens for these:

```ts
window.addEventListener("message", (event) => {
  const data = event.data as XhrPageMessage;
  if (event.source !== window) return;
  if (data?.source !== "igdl-xhr") return;
  mediaCache.ingestXhrSnapshot(data.endpoint, data.body);
});
```

`source: "igdl-xhr"` is the discriminator; `event.source !== window` rules out frame postMessages.

## What `MediaCacheService` does with snapshots

`ingestXhrSnapshot(endpoint, body)` dispatches on URL substring. Only two endpoints are wired today:

| Endpoint substring                    | Cache key                                    |
| ------------------------------------- | -------------------------------------------- |
| `/api/v1/users/web_profile_info/`     | `user_profile_pic_url`                       |
| `/api/v1/feed/timeline/`              | `id_to_username_map`                         |

Unknown endpoints are a silent no-op — Instagram emits many we don't care about. Additional parsers (post media, reels media, stories, highlights) are added as new endpoints are observed in live traffic.

See [`services/media-cache.md`](./services/media-cache.md) for the full dispatch table and the resolver API that handlers use to read the cache.

## Firefox `webRequest` fallback (planned)

Firefox's background entry (`src/background/firefox.ts`) registers a `webRequest.onBeforeRequest` listener for Instagram API URLs. The **intent** is to use `filterResponseData` to capture responses the `<script>`-injection approach might miss (e.g., requests made before `inject.js` finishes loading). The current handler body is a TODO — the listener is registered but the response-reading code is not yet wired.

## Tests

- `src/__tests__/xhr.spec.ts` — `installXhrInterceptor` idempotency, XHR patch behavior on success + non-JSON responses + thrown JSON, fetch patch behavior including clone-without-consume.

## Related docs

- [`architecture.md`](./architecture.md) § "XHR-interception layer" — high-level placement in the runtime.
- [`services/media-cache.md`](./services/media-cache.md) — what happens after snapshots arrive.
- [`adr/0003-xhr-main-world-patching.md`](./adr/0003-xhr-main-world-patching.md) — decision record.
- Reference extension's `src/inject.ts` — the pattern was ported from there.
