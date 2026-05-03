# Download flow

The click-to-file trace. Every download — from the feed, a reel, a story, a highlight, an avatar, or a Threads post — funnels through one pipeline at `src/content/flow/download.tsx:handleDownloadClick`.

## End-to-end trace

```
1. User clicks the injected download button
        │
        ▼
2. Document-level delegator in src/content/index.ts catches the click
        │
        ▼
3. The route's handler (post.ts / reels.ts / stories.ts / …) extracts media:
     • Most surfaces call /api/v1/media/{id}/info/ via getUrlFromInfoApi()
     • Carousels and highlight reels read MediaCacheService instead
        │
        ▼
4. Reference-shaped DownloadParams →
     downloadBridge.ts:downloadViaFlow → MediaResource[] →
     handleDownloadClick(resources, deps)
        │
        ▼
5. handleDownloadClick decides the per-profile path:
        │
        ├── settings.alwaysPromptSaveAs           → downloadAll(saveAs: true)
        ├── profile has a configured directory    → downloadAll() (silent, routed)
        ├── profile is on the never-ask list      → downloadAll(saveAs: true)
        └── otherwise                             → NoDirPopup with three choices
                ├── "Set directory and download"  → SettingsService.addProfile + downloadAll
                ├── "Use default directory"       → downloadAll
                └── "Don't ask again"             → SettingsService.addNeverAsk + downloadAll(saveAs: true)
        │
        ▼
6. downloadAll loops over resources:
     for each: DownloadService.queue(resource, { saveAs? }) →
       sendMessage({ type: "DOWNLOAD_MEDIA", resource, saveAs }) →
       background routeMessage → handleDownloadMedia
        │
        ▼
7. background/shared/downloads.ts:
     • settings = await deps.settings.get()
     • filename = buildFullPath(resource, settings)
     • chrome.downloads.download({ url, filename, saveAs })
     • settings.incrementDownload(resource.username)   ← profile counter
        │
        ▼
8. downloadAll aggregates per-resource results:
     successes / firstError / canceled
     Toast:
       all canceled → toast.info("Download canceled")
       all failed   → toast.failure(error)
       partial      → toast.failure("Only N/M downloaded — error")
       all ok       → toast.success("Downloaded @user")
```

## Which step is where

| Step | File |
| --- | --- |
| Button injection | `src/content/handlers/*.ts` (per route) |
| Click delegator | `src/content/index.ts:handleGlobalClick` |
| Reference-shape adapter | `src/content/downloadBridge.ts:downloadViaFlow` |
| Pipeline (decision tree) | `src/content/flow/download.tsx:handleDownloadClick` |
| No-directory modal | `src/content/modals/NoDirPopup.tsx` |
| Per-resource queue | `src/content/flow/download.tsx:downloadAll` |
| Content-side wrapper | `src/services/download/download.ts:DownloadService.queue` |
| Cross-context send | `src/utils/messages.ts:sendMessage` |
| Background dispatch | `src/background/shared/router.ts:routeMessage` |
| Background download | `src/background/shared/downloads.ts:handleDownloadMedia` |
| Filename + path | `src/services/download/naming.ts:buildFullPath` |
| Profile counter bump | `src/services/settings/settings.ts:incrementDownload` |

## Filename templating

`buildFilename()` in `src/services/download/naming.ts` interpolates the user's template, which defaults to `{username}-{id}-{datetime}`:

| Token | Source |
| --- | --- |
| `{username}` | `MediaResource.username`, set upstream by the handler. `downloadBridge.ts` falls back to `instagram` when the resource has no username. |
| `{id}` | `MediaResource.id` (post / reel / story id) |
| `{type}` | One of `post`, `reel`, `story`, `highlight`, `avatar`, `threads` |
| `{datetime}` | `formatDate(now, settings.datetimeFormat)` (default `YYYYMMDD_HHmmss`). Replaced with empty string if `settings.enableDatetimeFormat` is false. |

After interpolation:

1. Leading and trailing `-_.` separators are stripped.
2. Repeated `-` or `_` runs are collapsed.
3. The name is sanitized via `sanitizeFilename()`.
4. If the resource has an `index` and `useCarouselIndexing` is on, `_<index>` is appended.
5. The extension is lowercased; `.jpeg` → `.jpg` if `replaceJpegWithJpg` is on.

`resolveDirectory(username, settings)` returns the user's per-profile directory (case-insensitive match) or `settings.defaultDownloadDirectory`. `buildFullPath()` joins them — the result is what `chrome.downloads.download` receives in `filename` and is interpreted relative to the browser's Downloads folder.

Example with all defaults: a feed post by `@alice` with id `ABC` at `2026-04-16T15:07:42`, item 2 of a 3-image carousel, downloads to:

```
instagram/alice/alice-ABC-20260416_150742_2.jpg
```

## ZIP carousel path (the divergence)

Carousel posts can be downloaded as a single ZIP via the second injected button. The handler at `src/content/handlers/zip.ts`:

1. Resolves all carousel items to `MediaResource[]` the same way the regular flow does.
2. Calls `ZipService.build(entries)` (`src/services/zip/zip.ts`), which fetches every URL with `credentials: "omit"` and assembles them via `fflate` into an `application/zip` `Blob`.
3. Converts the blob to a base64 data URL with `FileReader.readAsDataURL` and dispatches `DOWNLOAD_ZIP` to the background.
4. The background's `handleDownloadZip` calls `chrome.downloads.download(saveAs: true)` with the data URL — the Save As dialog opens and the user picks the destination.

Consequences:

- The filename has **no directory prefix** — per-profile routing does not apply. The destination is whatever the user picks in the Save As dialog.
- Profile counters are **not** incremented for ZIP downloads — `incrementDownload` is only called from `handleDownloadMedia`.
- The blob crosses the SW boundary as a data URL because blob URLs are origin-scoped and don't survive the round trip.
- A persistent loading toast is shown during the build so the user knows the page may briefly freeze; it dismisses on completion or failure.
- `credentials: "omit"` is load-bearing: Instagram's CDN serves signed URLs without `Access-Control-Allow-Credentials`, so a credentialed fetch fails CORS.

## Cancellation

When the user dismisses Chrome's "Save As" dialog, `chrome.downloads.download` rejects with a message containing `"cancel"`. `downloadAll`'s `isUserCanceled()` catches this and shows `toast.info("Download canceled")` instead of a failure toast — only when **every** resource was canceled. A canceled-then-succeeded mix surfaces only the success/failure aggregate. Firefox uses similar wording; the regex `/cancel/i` covers both.
