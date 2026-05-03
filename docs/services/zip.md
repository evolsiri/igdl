# ZipService

Bundles a carousel's media into a single `application/zip` blob using `fflate`. Used by the carousel ZIP-download button (`src/content/handlers/zip.ts`) so users can save a multi-image carousel as one file.

This is the one download path that **bypasses** `chrome.downloads`: the content script anchor-clicks a blob URL directly. Consequence: ZIPs land in the browser's Downloads folder root, not the per-profile directory, and don't increment profile counters. See `../download-flow.md`.

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

`build()` fetches every URL **sequentially** with `credentials: "omit"`, collects each response as a `Uint8Array`, then assembles them via `fflate.zipSync` with `level: 0` (store, no deflate). Sequential by design — Instagram CDNs throttle parallel fetches from the same client. Level 0 because JPEG/MP4 files are already compressed; deflating them adds latency for no size gain.

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

- `src/content/handlers/zip.ts` — fetches every carousel item's `MediaResource`, calls `build()`, then anchor-clicks the resulting blob via `triggerAnchorDownload()` (`src/services/zip/download.ts`).

## Invariants

- `credentials: "omit"` is **load-bearing**, not a defensive default. Instagram's CDN serves signed URLs without `Access-Control-Allow-Credentials`; a credentialed fetch fails CORS with a `NetworkError` and the build aborts.
- `fflate` uses pure Uint8Array operations — no Streams API. This is load-bearing for Firefox: Firefox's Xray-wrapper security model prevents `ReadableStream.pipeTo` / `pipeThrough` from working in privileged content-script contexts, which broke `@zip.js/zip.js`'s pipeline there.
- Empty entry lists are an error, not an empty zip. Callers shouldn't reach `build()` with nothing to zip.
