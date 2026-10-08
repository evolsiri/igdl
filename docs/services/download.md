# DownloadService

Content-script-side wrapper around the `DOWNLOAD_MEDIA` message. Content scripts and the options page use it to request a download without ever touching `chrome.downloads.*` directly. The background worker is the single point of entry for `chrome.downloads.download` — see `../architecture.md`.

## Public API

```ts
type QueueResult =
  | { ok: true; downloadId: number; usedVp9?: boolean }
  | { ok: false; error: string; transport?: true };

interface DownloadService {
  queue(resource: MediaResource, options?: { saveAs?: boolean }): Promise<QueueResult>;
}

function createDownloadService(): DownloadService;
```

`queue()` sends a `DOWNLOAD_MEDIA` message via `sendMessage()` and unwraps the response. The `saveAs` option overrides `settings.alwaysPromptSaveAs` for that one call (used by the never-ask path so dialogs always appear).

`usedVp9` is set only for a resource that carried a `vp9` rendition, and only while the user's `preferVp9Reels` setting is on — the background ignores the rendition otherwise: `true` when the background downloaded the remuxed VP9 file, `false` when the remux failed and it downloaded `resource.url` instead. For such a resource the call lasts as long as the fetch and remux do — seconds, not milliseconds — so callers go through `queueResource()` in `src/content/flow/download.tsx`, which shows a loading toast for the wait.

`transport` is set on a failure when the background never answered — `sendMessage` could not reach it, it was torn down before replying, or what came back was not a response at all — as opposed to answering with an error. `queueResource()` uses it: a VP9 request that got no answer is sent once more without the `vp9` rendition, because the background's own fallback to the standard video died with it. A request made with `saveAs` is the exception and is not retried — see "VP9 reels" in `../download-flow.md`.

**Never throws.** Transport errors and download errors both surface as `{ ok: false, error }` — content-script code uses the discriminated result instead of try/catch.

## Lifecycle

Stateless. The factory returns a fresh service per call; there's no init or cleanup.

## What happens after `queue()`

```
DownloadService.queue
   │
   └─ sendMessage({ type: "DOWNLOAD_MEDIA", resource, saveAs })
                                │
                                ▼
                    background/shared/router.ts:routeMessage
                                │
                                └─ handleDownloadMedia (downloads.ts)
                                        │
                                        ├─ settings = await deps.settings.get()
                                        ├─ filename = buildFullPath(resource, settings)
                                        ├─ resource.vp9 ? deps.remux.build(resource.vp9) → minted url
                                        ├─ chrome.downloads.download({ url, filename, saveAs })
                                        └─ deps.settings.incrementDownload(resource.username)
```

The filename is computed in the **background**, not the content script — so the per-profile directory + filename template are applied once, with the canonical settings snapshot, even if the content script's local cache is briefly stale.

## Call sites

- `src/content/flow/download.tsx:queueResource` — the one direct caller of `queue()`; wraps it in the VP9 loading toast.
- `src/content/flow/download.tsx:downloadAll` — the per-resource queue loop in the download flow, via `queueResource`.
- `src/content/downloadBridge.ts:downloadViaFlow` — the right-click Save As path, via `queueResource`.

## Invariants

- Content scripts MUST NOT call `chrome.downloads.*` directly. Every use is in `src/background/shared/downloads.ts`: one `chrome.downloads.download` call, in `download()`, which `handleDownloadMedia` and `handleDownloadZip` both go through, and the `chrome.downloads.onChanged` listener in `releaseWhenSettled`.
- The carousel ZIP path is a separate message variant: `DOWNLOAD_ZIP` carries a base64 data URL, skips per-profile routing, and always opens the Save As dialog. Profile counters are not incremented. See `../download-flow.md` and `zip.md`.

## URL contract — what `chrome.downloads.download` accepts

`handleDownloadMedia` expects `resource.url` to be HTTPS or `data:`. The one scheme it checks for and rejects, with an actionable error, is `blob:`: such URLs are scoped to the document that minted them — the background is a different context and cannot read them. Any other URL is handed to the browser as is. Firefox refuses such a call outright ("Type error for parameter options"); Chrome accepts it and then fails the download, which without the guard would be reported as a success.

When a content script holds a blob URL (Instagram MSE/HLS players expose `<video>.src` as `blob:https://www.instagram.com/<uuid>` for some story and highlight videos), it must convert via `src/content/extractors/blob.ts:resolveBlobUrlToDataUrl` before dispatching `DOWNLOAD_MEDIA`. This mirrors the carousel ZIP path (see [`zip.md`](./zip.md)) which uses the same data-URL escape hatch.

The conversion is **last resort**, not the primary defense. When `<video>.src` is set from a `MediaSource` (the common Instagram case), the blob URL references the MediaSource — not a real `Blob` — and `fetch()` cannot dereference it. Story / highlight handlers therefore have a tier hierarchy that resolves to an HTTPS CDN URL whenever possible:

- **Tier A** — XHR-intercepted GraphQL cache (`storageCache.storiesReelsMedia`, `CACHE_KEYS.highlightMedia`). Populated by `src/inject.ts` / `src/xhr.ts` when the user navigates through the feed/profile.
- **Tier B** — inline-JSON SSR data parsed from `<script>` tags. Available even when the XHR cache is empty (direct navigation skips the feed pre-load). Returns HTTPS CDN URLs and bypasses the unfetchable-MSE-blob trap entirely.
  - Stories: `xdt_api__v1__feed__reels_media` — `src/content/handlers/stories.ts:findReelsMediaInJson`.
  - Highlights: `xdt_api__v1__feed__reels_media__connection` — `src/content/handlers/highlights.ts:findReelsConnection`.
- **Tier C** — DOM scrape (`<video>.src`, `<img>.src`). Last resort. May yield a `blob:` URL; the conversion path tries to dereference, fails on MediaSource-backed blobs, and surfaces a "cannot read MSE video stream" failure toast.

### What the background hands to the downloads API

The contract above is about what may *arrive in a message*. What `chrome.downloads.download` finally receives is decided in one place, `downloads.ts:mintDownloadUrl`, because the two browsers want opposite things for in-memory data:

- **Chrome** — the service worker has no `URL.createObjectURL`, and the downloads API accepts `data:` URLs. A `data:` URL from a content script passes through; a file built in the background (the remuxed VP9 reel) becomes a base64 `data:` URL.
- **Firefox** — `downloads.download` rejects every `data:` URL ("Access denied for URL data:…"), but the background page can mint a `blob:` URL, which is same-origin to the extension and so downloadable. A `data:` URL from a content script is therefore re-minted as a `blob:` URL before the call, and so is a file built in the background. `releaseWhenSettled` revokes the URL when the download completes or is interrupted; it also asks `downloads.search` once, right after it starts listening, in case a small file finished first.

A `blob:` URL minted this way never came from a message, which is the difference from the page-scoped ones rejected above. HTTPS URLs pass through untouched on both browsers.

When converting, callers preserve the original blob URL as a `nameSource` separate from the download URL: `getMediaName` is fed the blob URL (whose pathname carries a stable UUID), while the data URL is what reaches the SW. Without that split, `getMediaName(dataUrl)` would return a chunk of the base64 payload — the `getMediaName` helper short-circuits `data:` URLs to `""` as a defensive backstop.
