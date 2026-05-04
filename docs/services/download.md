# DownloadService

Content-script-side wrapper around the `DOWNLOAD_MEDIA` message. Content scripts and the options page use it to request a download without ever touching `chrome.downloads.*` directly. The background worker is the single point of entry for `chrome.downloads.download` — see `../architecture.md`.

## Public API

```ts
interface DownloadService {
  queue(
    resource: MediaResource,
    options?: { saveAs?: boolean },
  ): Promise<{ ok: true; downloadId: number } | { ok: false; error: string }>;
}

function createDownloadService(): DownloadService;
```

`queue()` sends a `DOWNLOAD_MEDIA` message via `sendMessage()` and unwraps the response. The `saveAs` option overrides `settings.alwaysPromptSaveAs` for that one call (used by the never-ask path so dialogs always appear).

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
                                        ├─ chrome.downloads.download({ url, filename, saveAs })
                                        └─ deps.settings.incrementDownload(resource.username)
```

The filename is computed in the **background**, not the content script — so the per-profile directory + filename template are applied once, with the canonical settings snapshot, even if the content script's local cache is briefly stale.

## Call sites

- `src/content/flow/download.tsx:downloadAll` — the per-resource queue loop in the download flow.
- `src/content/downloadBridge.ts:downloadViaFlow` — direct `queue()` call for the never-ask Save-As-only path.

## Invariants

- Content scripts MUST NOT call `chrome.downloads.*` directly. The two declared calls are in `src/background/shared/downloads.ts` (`handleDownloadMedia` and `handleDownloadZip`).
- The carousel ZIP path is a separate message variant: `DOWNLOAD_ZIP` carries a base64 data URL, skips per-profile routing, and always opens the Save As dialog. Profile counters are not incremented. See `../download-flow.md` and `zip.md`.

## URL contract — what `chrome.downloads.download` accepts

`handleDownloadMedia` enforces that `resource.url` is HTTPS or `data:`. `blob:` URLs are rejected with an actionable error because they are scoped to the document that minted them — the service worker is in a different context and `chrome.downloads.download({ url: "blob:..." })` returns Chromium's cryptic "Type error for parameter options".

When a content script holds a blob URL (Instagram MSE/HLS players expose `<video>.src` as `blob:https://www.instagram.com/<uuid>` for some story and highlight videos), it must convert via `src/content/extractors/blob.ts:resolveBlobUrlToDataUrl` before dispatching `DOWNLOAD_MEDIA`. This mirrors the carousel ZIP path (see [`zip.md`](./zip.md)) which uses the same data-URL escape hatch.

The two converted-blob paths today:

- Story video MSE fallback — `src/content/handlers/stories.ts:storyGetDownloadableUrl`.
- Highlight video MSE fallback — `src/content/handlers/highlights.ts` Tier C.

When converting, callers preserve the original blob URL as a `nameSource` separate from the download URL: `getMediaName` is fed the blob URL (whose pathname carries a stable UUID), while the data URL is what reaches the SW. Without that split, `getMediaName(dataUrl)` would return a chunk of the base64 payload — the `getMediaName` helper short-circuits `data:` URLs to `""` as a defensive backstop.
