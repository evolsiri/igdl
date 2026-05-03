import { zip as fflateZip, type Zippable } from "fflate";

/** One source file to add to the zip: a remote URL and its desired inner filename. */
export interface ZipEntry {
  /** Fully-qualified URL to fetch. Passed through to `fetch()` verbatim. */
  url: string;
  /** Filename the entry will have inside the produced zip. Should include the extension. */
  filename: string;
}

export interface ZipServiceOptions {
  /** Injected fetch; defaults to `globalThis.fetch`. Tests pass a stub. */
  fetchImpl?: typeof fetch;
}

export interface ZipService {
  /**
   * Fetches every entry's URL sequentially and assembles them into a single
   * `application/zip` `Blob`. Fetches run with `credentials: "omit"` — Instagram
   * CDN URLs are signed/public and the CDN does not return
   * `Access-Control-Allow-Credentials`, so a credentialed fetch would fail CORS.
   *
   * Entries are stored without compression (`level: 0`) because Instagram media
   * files (JPEG, MP4) are already compressed; deflating them adds latency with no
   * size benefit.
   *
   * Rejects on:
   *   - empty entry list
   *   - any non-2xx fetch response (message includes status + URL)
   *   - any network error on a fetch (message wraps the underlying cause)
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
 * Creates a ZipService backed by `fflate`. Content scripts instantiate one per
 * click; the service holds no mutable state between builds.
 *
 * `fflate` uses pure Uint8Array operations with no Streams API, which avoids
 * Firefox's Xray-wrapper restriction that prevents `ReadableStream.pipeTo` /
 * `pipeThrough` from working correctly in privileged content-script contexts.
 *
 * @example
 * const zipService = createZipService();
 * const blob = await zipService.build(entries);
 */
export function createZipService(options: ZipServiceOptions = {}): ZipService {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async build(entries) {
      if (entries.length === 0) {
        throw new Error("ZipService.build: no entries");
      }

      const fileMap: Zippable = {};
      try {
        for (const entry of entries) {
          const response = await fetchImpl(entry.url, { credentials: "omit" });
          if (!response.ok) {
            throw new Error(
              `ZipService.build: fetch ${entry.url} returned ${response.status}`,
            );
          }
          fileMap[entry.filename] = [
            new Uint8Array(await response.arrayBuffer()),
            { level: 0 },
          ];
        }
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.startsWith("ZipService.build:")) throw err;
          throw new Error(`ZipService.build: ${err.message}`, { cause: err });
        }
        throw new Error(`ZipService.build: ${String(err)}`, { cause: err });
      }

      return new Promise<Blob>((resolve, reject) => {
        fflateZip(fileMap, (err, data) => {
          if (err) {
            reject(new Error(`ZipService.build: ${err.message}`, { cause: err }));
          } else {
            resolve(new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
          }
        });
      });
    },
  };
}
