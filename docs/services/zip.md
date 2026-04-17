# ZipService

Content-script service that bundles a carousel's media into a single `.zip` and writes it to disk. Ported from the reference extension's `src/content/utils/zip.ts` (see [TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension)).

## Files

| Path | Role |
|---|---|
| `src/services/zip/zip.ts` | `ZipService` interface + `createZipService` — fetches each entry's URL and streams it into a `@zip.js/zip.js` `ZipWriter`, returning the resulting `Blob`. |
| `src/services/zip/download.ts` | `triggerAnchorDownload(blob, filename)` — writes a `Blob` to disk via a temporary `<a download>` anchor (content-script compatible). |
| `src/content/handlers/zip.ts` | `zipOnClicked` — click handler for the injected `.zip-btn`. Resolves the carousel via the Instagram info API, composes per-item + outer filenames through `buildFilename`, and calls `ZipService.build` + `triggerAnchorDownload`. |

## Client API

### `createZipService(options?)`

Creates a `ZipService`. Content scripts instantiate one per click; the service holds no mutable state between builds.

```ts
const zipService = createZipService();
const blob = await zipService.build([
  { url: "https://…/1.jpg", filename: "alice-ABC_1.jpg" },
  { url: "https://…/2.jpg", filename: "alice-ABC_2.jpg" },
]);
```

Options:

| Option | Type | Default | Effect |
|---|---|---|---|
| `fetchImpl` | `typeof fetch` | `globalThis.fetch` | Injected `fetch` — used by tests to stub responses. |
| `writerFactory` | `() => ZipWriterLike` | `@zip.js/zip.js` `ZipWriter(BlobWriter)` | Factory for a fresh writer per build — used by tests to stub the writer. |

### `ZipService.build(entries)`

Fetches every entry's URL sequentially with `credentials: "include"` (matches the reference extension's behavior against Instagram CDN URLs) and streams each response blob into the writer with the supplied inner filename. Rejects on:

- empty entry list (`ZipService.build: no entries`)
- non-2xx response (`ZipService.build: fetch <url> returned <status>`)
- network error (`ZipService.build: <cause>`)

The writer is always closed — callers don't have to worry about leaks.

### `triggerAnchorDownload(blob, filename)`

Writes `blob` to disk as `filename` via a temporary hidden `<a href download>` element. Revokes the backing object URL after 100ms so the browser has time to read the blob.

```ts
const blob = await zipService.build(entries);
triggerAnchorDownload(blob, "alice-ABC-20260416_150742.zip");
```

## Architectural note: anchor-click, not `chrome.downloads`

Every other download in this extension routes through `DownloadService` → background worker → `chrome.downloads.download` (TAC-4.1). The zip path is the one explicit exception:

- The content script builds the `Blob` and creates an object URL in its own context.
- Blob URLs are origin-scoped to the context that created them, so the background service worker cannot resolve a blob URL handed to it via `chrome.runtime.sendMessage`.
- Serializing the blob across the message boundary (base64 data URL) inflates size by ~33% and runs into the MV3 sendMessage serialization budget for large carousels.
- Re-fetching each URL from the background would break the post-context cookies the reference extension relies on.

The content-script anchor-click is the smallest correct path. Consequences, documented for operators:

- The zip lands in the Downloads folder root. **Per-profile directory routing does not apply to zips.** Use `DownloadService` if a release ever needs zip-to-subfolder behavior.
- `alwaysPromptSaveAs` has **no effect** on zips — anchor downloads don't honor the OS Save As override.
- Download cancellation is not observable from the extension (the browser owns the save).

## Configuration: no Web Workers

`@zip.js/zip.js` defaults to spawning a Web Worker for compression. MV3 content scripts can't do that without declaring the worker script URL in `web_accessible_resources` and adding a corresponding manifest entry — which we don't want. `createZipService` calls `configure({ useWebWorkers: false })` at module load so everything runs on the main thread. This is fine for Instagram carousels (≤10 items, tens of MB total).

## Consumers

- `src/content/handlers/zip.ts` — the only caller. Click on a `.igdl-custom-btn.zip-btn` anchor → `zipOnClicked` → `ZipService.build` → `triggerAnchorDownload` → success/failure toast.
- Routing happens in `src/content/button.ts#onClickHandler` via `currentTarget.classList.contains("zip-btn")` short-circuit before the per-surface dispatch table.

## Visibility

The `.zip-btn` is only injected when all of these are true (see `src/content/button.ts:102-111`):

- `showZipDownloadIcon` setting is on (default).
- Desktop user-agent (`checkType() === "pc"`).
- Host is `www.instagram.com` (Threads and other surfaces are excluded).
- Pathname does not start with `/reel` or `/stories/`.

The click handler additionally rejects non-carousel posts (single-media posts) with a red failure toast — the button shouldn't render for those, but Instagram's DOM is fluid so the guard is defensive.

## Tests

- `src/services/zip/__tests__/zip.spec.ts` — `build` covers: empty list, happy path reads back the zip with `ZipReader`, non-2xx rejection, network-error wrapping, writer closes on failure, original error propagates when close also throws, `credentials: "include"` is passed.
- `src/services/zip/__tests__/download.spec.ts` — `triggerAnchorDownload` covers: anchor creation + attributes, DOM removal after click, 100ms `URL.revokeObjectURL`, zero-byte blob.
- `tests/content/handlers/zip.test.ts` — `zipOnClicked` covers: carousel happy path (entries + outer filename match), non-carousel rejection, missing article rejection, missing info rejection, build-failure propagates as failure toast, empty-owner fallback to `instagram`, video-item URL extraction.
- `tests/content/button.test.ts` — routing regression: `.zip-btn` click invokes `zipOnClicked` and bypasses `postOnClicked`; `.download-btn` click still routes through the per-surface table.
