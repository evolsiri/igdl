import { BlobReader, BlobWriter, configure, ZipWriter } from "@zip.js/zip.js";

/**
 * Configure `@zip.js/zip.js` to run on the main thread. Content scripts can't
 * spawn Web Workers from a packaged extension script without declaring the
 * worker URL in `web_accessible_resources`, so we disable worker usage
 * altogether. Zip assembly on the main thread is fine for Instagram carousels
 * (typically ≤10 items, tens of MB total) and keeps the manifest minimal.
 */
configure({ useWebWorkers: false });

/** One source file to add to the zip: a remote URL and its desired inner filename. */
export interface ZipEntry {
  /** Fully-qualified URL to fetch. Passed through to `fetch()` verbatim. */
  url: string;
  /** Filename the entry will have inside the produced zip. Should include the extension. */
  filename: string;
}

/**
 * Minimal shape of the `ZipWriter` methods ZipService consumes. Lets tests
 * inject a stubbed writer without depending on `@zip.js/zip.js`'s runtime.
 */
export interface ZipWriterLike {
  add(filename: string, reader: BlobReader): Promise<unknown>;
  close(): Promise<Blob>;
}

export interface ZipServiceOptions {
  /** Injected fetch; defaults to `globalThis.fetch`. Tests pass a stub. */
  fetchImpl?: typeof fetch;
  /** Factory returning a fresh ZipWriter; defaults to `@zip.js/zip.js` + `BlobWriter`. */
  writerFactory?: () => ZipWriterLike;
}

export interface ZipService {
  /**
   * Fetches every entry's URL sequentially and streams each response into a
   * fresh `ZipWriter`, producing a single `application/zip` `Blob`. Fetches
   * use `credentials: "include"` to match the reference extension's behavior
   * against Instagram CDN URLs.
   *
   * Rejects on:
   *   - empty entry list
   *   - any non-2xx fetch response (message includes status + URL)
   *   - any network error on a fetch (message wraps the underlying cause)
   *
   * The writer is always closed — callers don't have to worry about leaks.
   *
   * @example
   * const zipService = createZipService();
   * const blob = await zipService.build([
   *   { url: "https://…/1.jpg", filename: "alice-ABC_1.jpg" },
   *   { url: "https://…/2.jpg", filename: "alice-ABC_2.jpg" },
   * ]);
   * // → Blob(application/zip) containing both images
   */
  build(entries: ZipEntry[]): Promise<Blob>;
}

/**
 * Creates a ZipService. Content scripts instantiate one per click; the
 * service holds no mutable state between builds.
 *
 * @example
 * const zipService = createZipService();
 * const blob = await zipService.build(entries);
 */
export function createZipService(options: ZipServiceOptions = {}): ZipService {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const writerFactory =
    options.writerFactory ??
    (() => new ZipWriter(new BlobWriter("application/zip")) as unknown as ZipWriterLike);

  return {
    async build(entries) {
      if (entries.length === 0) {
        throw new Error("ZipService.build: no entries");
      }

      const writer = writerFactory();
      try {
        for (const entry of entries) {
          const response = await fetchImpl(entry.url, { credentials: "include" });
          if (!response.ok) {
            throw new Error(
              `ZipService.build: fetch ${entry.url} returned ${response.status}`,
            );
          }
          const blob = await response.blob();
          await writer.add(entry.filename, new BlobReader(blob));
        }
        return await writer.close();
      } catch (err) {
        try {
          await writer.close();
        } catch {
          // Closing an errored writer is best-effort — swallow secondary failures
          // so the original cause propagates.
        }
        if (err instanceof Error) {
          if (err.message.startsWith("ZipService.build:")) throw err;
          throw new Error(`ZipService.build: ${err.message}`, { cause: err });
        }
        throw new Error(`ZipService.build: ${String(err)}`, { cause: err });
      }
    },
  };
}
