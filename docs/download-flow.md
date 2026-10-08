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
     • For a reel, with "Download reels in VP9" on: resolveReelVp9() also
       picks the VP9 rendition out of the item's DASH manifest
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
     • if resource.vp9 and settings.preferVp9Reels: buildVp9() —
       RemuxService.build(), then a URL for the file; one build at a time
       (on failure: keep resource.url, report usedVp9: false)
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
       several ok   → toast.success("Downloaded N items from @user")
       VP9 saved    → toast.success("Downloaded @user in VP9")
       VP9 failed   → toast.info("Downloaded @user in standard quality — VP9 failed")
```

## Which step is where

| Step | File |
| --- | --- |
| Button injection | `src/content/handlers/*.ts` (per route) |
| Click delegator | `src/content/index.ts:handleGlobalClick` |
| VP9 rendition pick | `src/content/extractors/dash.ts:resolveReelVp9` |
| Reference-shape adapter | `src/content/downloadBridge.ts:downloadViaFlow` |
| Pipeline (decision tree) | `src/content/flow/download.tsx:handleDownloadClick` |
| No-directory modal | `src/content/modals/NoDirPopup.tsx` |
| Per-resource queue | `src/content/flow/download.tsx:downloadAll` |
| Content-side wrapper | `src/services/download/download.ts:DownloadService.queue` |
| Cross-context send | `src/utils/messages.ts:sendMessage` |
| Background dispatch | `src/background/shared/router.ts:routeMessage` |
| Background download | `src/background/shared/downloads.ts:handleDownloadMedia` |
| VP9 fetch + remux | `src/services/remux/remux.ts:RemuxService.build` |
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
4. The background's `handleDownloadZip` calls `chrome.downloads.download(saveAs: true)` — the Save As dialog opens and the user picks the destination. Chrome is given the data URL as is; Firefox rejects `data:` URLs there, so the background first re-mints it as a `blob:` URL of its own (`downloads.ts:mintDownloadUrl`).

Consequences:

- The filename has **no directory prefix** — per-profile routing does not apply. The destination is whatever the user picks in the Save As dialog.
- Profile counters are **not** incremented for ZIP downloads — `incrementDownload` is only called from `handleDownloadMedia`.
- The blob crosses the SW boundary as a data URL because blob URLs are origin-scoped and don't survive the round trip.
- A persistent loading toast is shown during the build so the user knows the page may briefly freeze; it dismisses on completion or failure.
- `credentials: "omit"` is load-bearing: Instagram's CDN serves signed URLs without `Access-Control-Allow-Credentials`, so a credentialed fetch fails CORS.

## VP9 reels (the remux path)

With **Download reels in VP9** on (`settings.preferVp9Reels`, off by default), a reel downloads as Instagram's VP9 encoding instead of the standard video. The standard video is `video_versions[0]` — a single progressive H.264 file with video and audio together. The VP9 encoding exists only inside the item's DASH manifest (`video_dash_manifest`), as a video-only stream next to a separate audio stream. Saving it therefore takes three extra steps:

1. **Pick** (content script). `resolveReelVp9(item)` returns a `DashRendition` — `{ videoUrl, audioUrl? }` — or nothing. It returns a rendition only when all of these hold:
   - the setting is on;
   - the item is a reel: `product_type` is `"clips"`, or the field is absent and the page is a reel page (`isReelRoute`: `/reel/:id`, `/reels/:id`, `/:user/reel/:id`). Any other product type — a carousel item, a classic feed video — is not a reel wherever it is shown, and stories and highlights never reach this code;
   - the manifest lists a VP9 stream, as a whole file on Instagram's CDN, that is not smaller than the standard video;
   - the manifest's first audio track is usable too. A video-only rendition is returned only for an item marked `has_audio: false` — a reel with sound is never saved silent.

   The rendition travels on `MediaResource.vp9`; `MediaResource.url` stays the standard video.
2. **Remux** (background). `handleDownloadMedia` sees `resource.vp9`, checks the setting itself, calls `RemuxService.build()` to fetch both streams and stream-copy them into one MP4, and downloads that file under the same filename the standard video would have had. See [`services/remux.md`](./services/remux.md).
3. **Report** (content script). The response carries `usedVp9`. `queueResource` shows `Preparing VP9 download…` while it waits; `downloadAll` then shows `Downloaded @user in VP9`.

Consequences:

- **A failed remux never costs the download.** If the VP9 file can't be built — an expired URL, a reel over the 128 MiB limit, a stream the remuxer rejects, a URL that isn't on Instagram's CDN, a finished file that can't be turned into a download URL — the background downloads `resource.url` instead and answers `usedVp9: false`; the user gets the standard video and the info toast `Downloaded @user in standard quality — VP9 failed`. What is *not* retried is a rejection from the downloads API itself: a canceled Save As or an invalid filename fails the download, exactly as it does for a standard one.
- **A background that never answers gets one retry, except behind a Save As dialog.** If the background's context is torn down mid-remux, its own fallback dies with it, so `queueResource` asks once more for the standard video. "No answer" does not prove nothing was saved, though: a background stopped after it started the download leaves a file behind, and the retry adds a second. Without a dialog that window is a few milliseconds. With one, the request stays open for as long as the dialog does, so a Save As download is never retried and the failure is reported instead.
- **The setting is checked on both sides.** The content script attaches a rendition only while the setting is on, and the background ignores `resource.vp9` while it is off — so turning the setting off stops the fetch and the remux even for a tab whose settings cache is stale.
- **A reel with nothing to upgrade to never enters this path.** No VP9 stream, a VP9 stream smaller than the standard video, or missing audio: the reel downloads as usual with the usual toast.
- **Same routing, naming and counters.** The remuxed file goes through `buildFullPath` and `incrementDownload` like any other download. The extension stays `.mp4`.
- **"Open in new tab" is unaffected** — it opens the standard video, which is a URL a tab can play.
- **Right-click Save As** takes the same path with the same loading and fallback toasts. As for a standard download, it shows no toast on success.
- **One reel, one preparation.** `downloadViaFlow` ignores a second click on a reel whose VP9 download is still in flight and says `VP9 download already in progress`, instead of fetching and remuxing the same streams twice. It knows the reel by the path of its VP9 stream, not the whole URL: the query string holds the CDN signature, which can differ between two responses.
- **One build at a time.** A build holds both streams, the output and (on Chrome) its base64 copy in memory at once. Different reels, or the same reel from two tabs, can still be requested together, so the background queues builds: a second request waits, under its loading toast, until the first has its file.
- **The file reaches `chrome.downloads.download` differently per browser.** Chrome's service worker has no `URL.createObjectURL`, so the file is passed as a base64 `data:` URL. Firefox rejects `data:` URLs in `downloads.download`, but its background page can mint a `blob:` URL, which is revoked once the download settles. See the URL contract in [`services/download.md`](./services/download.md).
- **One extra lookup on the reels feed.** The reel data the feed handler finds on the page doesn't always include the manifest; when it is missing, `reels.ts` asks the info API for it, under the loading toast `Checking for a VP9 version…`. The lookup names the reel by its own shortcode — never by the page URL, which the feed rewrites as the user scrolls — and is given four seconds before the download goes ahead in standard quality. It is only made while the setting is on. A lookup that times out is indistinguishable, to the user, from a reel with no VP9 version: the standard video downloads with the usual toast, and a second click usually finds the answer cached.

## Cancellation

When the user dismisses Chrome's "Save As" dialog, `chrome.downloads.download` rejects with a message containing `"cancel"`. `downloadAll`'s `isUserCanceled()` catches this and shows `toast.info("Download canceled")` instead of a failure toast — only when **every** resource was canceled. A canceled-then-succeeded mix surfaces only the success/failure aggregate. Firefox uses similar wording; the regex `/cancel/i` covers both.
