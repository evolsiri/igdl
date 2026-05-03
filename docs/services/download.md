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
