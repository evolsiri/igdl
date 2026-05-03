# ZipService

Bundles a carousel's media into a single `application/zip` blob using `fflate`. Used by the carousel ZIP-download button (`src/content/handlers/zip.ts`) so users can save a multi-image carousel as one file.

The handler converts the blob to a base64 data URL and sends it to the background as `DOWNLOAD_ZIP` with `saveAs: true`. The background hands the data URL to `chrome.downloads.download`, which opens the Save As dialog so the user picks the destination. Per-profile routing is skipped (no directory prefix on the filename) and profile counters are not bumped. See `../download-flow.md`.

## Public API

```ts
interface ZipEntry {
  url: string;
  filename: string;  // including extension
}

interface ZipService {
  build(entries: ZipEntry[]): Promise<Blob>;
}

function createZipService(options?: ZipServiceOptions): ZipService;
```

`build()` fetches every URL **sequentially** with `credentials: "omit"`, collects each response as a `Uint8Array`, then assembles them asynchronously via `fflate`'s callback-style `zip(fileMap, cb)` with `level: 0` (store, no deflate). Sequential fetches by design — Instagram CDNs throttle parallel fetches from the same client. Level 0 because JPEG/MP4 files are already compressed; deflating them adds latency for no size gain.

Rejects on:
- Empty entry list.
- Any non-2xx response (message includes the URL and status).
- Any underlying network error (wrapped in a `ZipService.build:` prefix).

Errors during fetch are wrapped with the `ZipService.build:` prefix before propagating.

## Lifecycle

Stateless. Content scripts instantiate one service per click — there's no value in reusing.

## Storage

None.

## Call sites

- `src/content/handlers/zip.ts` — fetches every carousel item, calls `build()`, converts the blob to a data URL via `FileReader.readAsDataURL`, and dispatches a `DOWNLOAD_ZIP` message so the background can call `chrome.downloads.download(saveAs: true)`. (`triggerAnchorDownload()` in `src/services/zip/download.ts` is reachable but currently used only by tests.)

## Invariants

- `credentials: "omit"` is **load-bearing**, not a defensive default. Instagram's CDN serves signed URLs without `Access-Control-Allow-Credentials`; a credentialed fetch fails CORS with a `NetworkError` and the build aborts.
- `fflate` uses pure Uint8Array operations — no Streams API. This is load-bearing for Firefox: Firefox's Xray-wrapper security model prevents `ReadableStream.pipeTo` / `pipeThrough` from working in privileged content-script contexts, which broke `@zip.js/zip.js`'s pipeline there.
- Empty entry lists are an error, not an empty zip. Callers shouldn't reach `build()` with nothing to zip.
