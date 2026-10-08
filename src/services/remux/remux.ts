import type { DashRendition } from "../../types/instagram";
import { isInstagramCdnUrl } from "../../utils/instagram-cdn";
import { remuxToMp4 } from "./mp4";

/**
 * Largest rendition `build()` accepts by default — and the largest file it
 * will produce. The streams, the remuxed file, and (in Chrome's service
 * worker) its base64 data URL all live in memory at once, and that data URL
 * has to fit in one extension-API message.
 */
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 120_000;

export interface RemuxServiceOptions {
  /** Injected fetch; defaults to `globalThis.fetch`. Tests pass a stub. */
  fetchImpl?: typeof fetch;
  /**
   * Rejects renditions whose streams add up to more than this many bytes, and
   * streams that would remux into a file larger than that. Defaults to 128 MiB.
   */
  maxBytes?: number;
  /** Aborts both transfers after this many milliseconds. Defaults to two minutes. */
  timeoutMs?: number;
  /** Which URLs may be fetched. Defaults to Instagram's media CDN hosts (`isInstagramCdnUrl`). */
  isAllowedUrl?: (url: string) => boolean;
}

export interface RemuxService {
  /**
   * Fetches a DASH rendition's video-only and audio-only streams and remuxes
   * them into a single `video/mp4` `Blob`. The streams are copied, never
   * re-encoded, so the result keeps the rendition's exact quality. A rendition
   * without `audioUrl` yields a video-only file.
   *
   * Fetches run with `credentials: "omit"` — Instagram's CDN URLs are signed
   * and answer any origin, which is what lets the background fetch them
   * without a CDN host permission. Only CDN URLs are fetched: the URLs
   * originate in page data, and this runs with the extension's origin.
   *
   * Rejects (message prefixed `RemuxService.build:`) on:
   *   - a URL — requested, or reached through a redirect — that `isAllowedUrl` refuses
   *   - any non-2xx response or network error
   *   - streams larger than `maxBytes` combined; the transfer stops at the limit
   *   - streams that would remux into a file larger than `maxBytes`
   *   - a transfer that outlives `timeoutMs`
   *   - a stream `remuxToMp4` cannot parse
   *
   * @example
   * const remux = createRemuxService();
   * const blob = await remux.build({
   *   videoUrl: "https://scontent.cdninstagram.com/o1/v/t16/f2/m69/vp9-1080p.mp4",
   *   audioUrl: "https://scontent.cdninstagram.com/o1/v/t16/f2/m69/aac.mp4",
   * });
   * // → Blob(video/mp4) holding both tracks
   */
  build(rendition: DashRendition): Promise<Blob>;
}

/**
 * Creates a RemuxService. The background owns the only production instance;
 * the service holds no state between builds.
 *
 * @example
 * const remux = createRemuxService({ timeoutMs: 30_000 });
 * const blob = await remux.build({
 *   videoUrl: "https://scontent.cdninstagram.com/o1/v/t16/f2/m69/vp9-1080p.mp4",
 * });
 */
export function createRemuxService(options: RemuxServiceOptions = {}): RemuxService {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isAllowedUrl = options.isAllowedUrl ?? isInstagramCdnUrl;

  function assertWithinLimit(bytes: number): void {
    if (bytes > maxBytes) {
      throw new Error(`rendition is ${toMegabytes(bytes)} MB, over the ${toMegabytes(maxBytes)} MB limit`);
    }
  }

  return {
    async build(rendition) {
      const urls = rendition.audioUrl
        ? [rendition.videoUrl, rendition.audioUrl]
        : [rendition.videoUrl];
      // One controller for both transfers: a failure or timeout on either stops
      // the other instead of leaving tens of megabytes downloading unobserved.
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error(`timed out after ${timeoutMs / 1000} s`)),
        timeoutMs,
      );
      try {
        const targets = urls.map((url) => {
          if (!isAllowedUrl(url)) throw new Error(`refusing to fetch ${url}: not a media CDN URL`);
          // Fetch the form that was checked — parsed and absolute — so nothing
          // downstream can read the same string as a relative URL.
          return new URL(url).href;
        });
        const responses = await Promise.all(
          targets.map((url) => fetchImpl(url, { credentials: "omit", signal: controller.signal })),
        );
        let declaredBytes = 0;
        responses.forEach((response, i) => {
          if (!response.ok) throw new Error(`fetch ${urls[i]} returned ${response.status}`);
          if (response.redirected && !isAllowedUrl(response.url)) {
            throw new Error(`fetch ${urls[i]} was redirected off the media CDN`);
          }
          declaredBytes += Number(response.headers.get("content-length")) || 0;
        });
        // Checked before the bodies are read, so an oversized reel costs no download.
        assertWithinLimit(declaredBytes);

        // …and again while reading: a missing or wrong Content-Length must not
        // let a transfer run past the limit before anyone looks.
        let receivedBytes = 0;
        const streams = await Promise.all(
          responses.map((response) =>
            readBody(response, (bytes) => assertWithinLimit((receivedBytes += bytes))),
          ),
        );
        return new Blob([remuxToMp4(streams, maxBytes)], { type: "video/mp4" });
      } catch (err) {
        controller.abort();
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`RemuxService.build: ${message}`, { cause: err });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Reads a response body chunk by chunk, reporting each chunk's size to
 * `onChunk` before keeping it — `onChunk` throws to stop the transfer.
 */
async function readBody(
  response: Response,
  onChunk: (bytes: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) {
    const whole = new Uint8Array(await response.arrayBuffer());
    onChunk(whole.byteLength);
    return whole;
  }
  // Size the buffer from Content-Length when there is one; otherwise grow it.
  let buffer = new Uint8Array(Number(response.headers.get("content-length")) || 0);
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(value.byteLength);
    if (length + value.byteLength > buffer.byteLength) {
      const grown = new Uint8Array(Math.max(buffer.byteLength * 2, length + value.byteLength));
      grown.set(buffer.subarray(0, length));
      buffer = grown;
    }
    buffer.set(value, length);
    length += value.byteLength;
  }
  return length === buffer.byteLength ? buffer : buffer.slice(0, length);
}

function toMegabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}
