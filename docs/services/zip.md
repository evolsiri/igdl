# ZipService

Bundles a carousel's media into a single `application/zip` blob using `@zip.js/zip.js`. Used by the carousel ZIP-download button (`src/content/handlers/zip.ts`) so users can save a multi-image carousel as one file.

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

`build()` fetches every URL **sequentially** with `credentials: "omit"`, streams each response into a `ZipWriter`, and returns the final `Blob`. Sequential by design — Instagram CDNs throttle parallel fetches from the same client.

Rejects on:
- Empty entry list.
- Any non-2xx response (message includes the URL and status).
- Any underlying network error (wrapped in a `ZipService.build:` prefix).

The writer is always closed, even on error.

## Lifecycle

Stateless. A fresh `ZipWriter` is created per `build()` call. Content scripts instantiate one service per click — there's no value in reusing.

`@zip.js/zip.js` is configured at module load with `useWebWorkers: false`. Web Workers from a packaged extension script need the worker URL declared in `web_accessible_resources`, which we don't want for an internal-only worker. Main-thread zipping handles Instagram carousels (typically ≤10 items, tens of MB) fine.

## Storage

None.

## Call sites

- `src/content/handlers/zip.ts` — fetches every carousel item's `MediaResource`, calls `build()`, then anchor-clicks the resulting blob via `triggerAnchorDownload()` (`src/services/zip/download.ts`).

## Invariants

- `credentials: "omit"` is **load-bearing**, not a defensive default. Instagram's CDN serves signed URLs without `Access-Control-Allow-Credentials`; a credentialed fetch fails CORS with a `NetworkError` and the build aborts.
- Errors don't leak the `ZipWriter`. Even when an underlying fetch throws, the writer's `close()` runs in a best-effort `try` so the original error propagates with a useful message.
- Empty entry lists are an error, not an empty zip. Callers shouldn't reach `build()` with nothing to zip.
