import { buildFullPath } from "../../services/download/naming";
import type { DashRendition } from "../../types/instagram";
import type { DownloadMediaResult, Message, MessageResponse } from "../../types/messages";
import { blobToDataUrl } from "../../utils/blob";
import { isInstagramCdnUrl } from "../../utils/instagram-cdn";
import type { BackgroundDeps } from "./deps";

type DownloadMediaMessage = Extract<Message, { type: "DOWNLOAD_MEDIA" }>;
type DownloadZipMessage = Extract<Message, { type: "DOWNLOAD_ZIP" }>;

/** How often a pending handler pokes the extension API — see `keepAlive`. */
const KEEP_ALIVE_MS = 10_000;
/** Longest error text sent back across the message boundary. */
const MAX_ERROR_LENGTH = 300;

const BLOB_URL_ERROR =
  "cannot download blob: URL — content script must convert it to a data URL first";

/** A URL parser would accept leading whitespace and any letter case, so the guard does too. */
const BLOB_URL = /^\s*blob:/i;

/**
 * The VP9 build that every later one waits behind. Builds run one at a time:
 * each holds its two streams, the remuxed file and (on Chrome) a base64 copy
 * of it in memory at once, and a content script can ask for several together
 * — two tabs, or a second reel clicked while the first is being prepared. It
 * only has to last as long as the handlers waiting on it, so it is safe as
 * module state in a service worker.
 */
let vp9Turn: Promise<unknown> = Promise.resolve();

/** A URL `chrome.downloads.download` can read, plus how to free it afterwards. */
interface MintedUrl {
  url: string;
  /** Revokes a `blob:` URL minted here. `null` when there is nothing to free. */
  release: (() => void) | null;
}

/**
 * Handles `DOWNLOAD_MEDIA`. Computes the full relative path via
 * `DownloadService` naming helpers, invokes `chrome.downloads.download`, and
 * bumps the profile's `downloadCount` + `lastDownloadAt` on success. Never
 * throws — returns a discriminated `MessageResponse`.
 *
 * **VP9 renditions.** When `resource.vp9` is set and the user has
 * `preferVp9Reels` on, the two DASH streams are fetched and remuxed here
 * (`RemuxService`) and the resulting file is downloaded in place of
 * `resource.url`. If the file can't be built — a failed fetch, an oversized
 * or unreadable stream, a URL off Instagram's CDN, a file that can't be
 * turned into a download URL — the standard video downloads instead and the
 * response says so via `usedVp9: false`. A rejection from the downloads API
 * itself (a canceled Save As, an invalid filename) fails the request and is
 * not retried. With the setting off, `resource.vp9` is ignored and the
 * response carries no `usedVp9`.
 *
 * **URL contract.** `resource.url` MUST be HTTPS (Instagram CDN) or `data:`
 * (content-script-converted blob). `blob:` URLs are rejected here because
 * they are scoped to the document that minted them and this context cannot
 * read them: Firefox refuses the call ("Type error for parameter options"),
 * while Chrome accepts it and then fails the download, which would report
 * success for a file that never arrives. Content scripts are responsible
 * for converting `blob:` to `data:` via
 * `src/content/extractors/blob.ts:resolveBlobUrlToDataUrl` before sending.
 * What the downloads API finally receives is decided by `mintDownloadUrl`.
 *
 * @example
 * const r = await handleDownloadMedia({ type: "DOWNLOAD_MEDIA", resource }, deps);
 * if (r.ok) console.log("queued", r.data.downloadId);
 */
export async function handleDownloadMedia(
  message: DownloadMediaMessage,
  deps: BackgroundDeps,
): Promise<MessageResponse<DownloadMediaResult>> {
  if (BLOB_URL.test(message.resource.url)) return { ok: false, error: BLOB_URL_ERROR };
  try {
    return await keepAlive(async () => {
      const settings = await deps.settings.get();
      const filename = buildFullPath(message.resource, settings);
      // The content script only attaches a rendition while the setting is on.
      // Checking again here makes the setting a switch that holds whatever a
      // page gets a content script to send.
      const vp9 = settings.preferVp9Reels ? message.resource.vp9 : undefined;
      const vp9File = vp9 ? await buildVp9(vp9, deps) : null;
      const downloadId = await download(
        vp9File ?? (await mintDownloadUrl(message.resource.url)),
        { filename, saveAs: message.saveAs ?? settings.alwaysPromptSaveAs },
      );
      await deps.settings.incrementDownload(message.resource.username);
      return {
        ok: true as const,
        data: vp9 ? { downloadId, usedVp9: vp9File !== null } : { downloadId },
      };
    });
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/**
 * Handles `DOWNLOAD_ZIP`. Receives a base64 data URL built in the content
 * script (blob URLs are origin-scoped and cannot cross the SW boundary) and
 * hands it to `chrome.downloads` — as is on Chrome, re-minted as a `blob:`
 * URL on Firefox, which refuses `data:` (see `mintDownloadUrl`). Never throws.
 *
 * **URL contract.** `message.dataUrl` MUST be a `data:` URL. The carousel
 * zip flow builds a Blob in the content script and converts it via
 * `blobToDataUrl` before sending — so a `blob:` URL here would only arise
 * from a future regression. The defensive guard mirrors `handleDownloadMedia`
 * to keep the SW boundary's URL-shape contract symmetric.
 *
 * @example
 * const r = await handleDownloadZip({ type: "DOWNLOAD_ZIP", dataUrl, filename });
 * if (r.ok) console.log("queued", r.data.downloadId);
 */
export async function handleDownloadZip(
  message: DownloadZipMessage,
): Promise<MessageResponse<{ downloadId: number }>> {
  if (BLOB_URL.test(message.dataUrl)) return { ok: false, error: BLOB_URL_ERROR };
  try {
    const downloadId = await keepAlive(async () =>
      download(await mintDownloadUrl(message.dataUrl), {
        filename: message.filename,
        saveAs: message.saveAs ?? false,
      }),
    );
    return { ok: true, data: { downloadId } };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/**
 * Keeps this background context alive while `work` is pending. Firefox
 * unloads its background page about 30 seconds after the last extension API
 * call — a request that is still being answered, or a fetch in flight, does
 * not count. A remux over a slow connection, or a Save As dialog left open,
 * outlasts that; the page would be torn down mid-download and the sender
 * told nobody answered. A trivial API call on a timer resets the clock.
 * Chrome's service worker stays alive for a pending reply without it; there
 * the call is unneeded and harmless.
 */
async function keepAlive<T>(work: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(() => undefined), KEEP_ALIVE_MS);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

/**
 * Starts a download — the only `chrome.downloads.download` call in the
 * extension. It takes a `MintedUrl`, so every URL that reaches the browser
 * has been through `mintDownloadUrl`, and frees that URL if the browser
 * refuses it.
 */
async function download(
  minted: MintedUrl,
  options: { filename: string; saveAs: boolean },
): Promise<number> {
  let downloadId: number;
  try {
    downloadId = await chrome.downloads.download({ url: minted.url, ...options });
  } catch (err) {
    minted.release?.();
    throw err;
  }
  if (minted.release) releaseWhenSettled(downloadId, minted.release);
  return downloadId;
}

/**
 * Fetches a VP9 rendition, remuxes it and mints a download URL for the file,
 * once every build asked for earlier has finished. Returns `null` — after
 * logging why — when any step fails, so the caller can fall back to the
 * standard video.
 */
function buildVp9(rendition: DashRendition, deps: BackgroundDeps): Promise<MintedUrl | null> {
  const built = vp9Turn.then(async () => {
    try {
      // The rendition arrives in a message from a content script, and its URLs
      // originate in page data. Only ever fetch Instagram's own CDN.
      if (!isInstagramCdnUrl(rendition.videoUrl)) throw new Error("VP9 video URL is not a CDN URL");
      if (rendition.audioUrl !== undefined && !isInstagramCdnUrl(rendition.audioUrl)) {
        throw new Error("VP9 audio URL is not a CDN URL");
      }
      return await mintDownloadUrl(await deps.remux.build(rendition));
    } catch (err) {
      console.warn("[igdl] VP9 remux failed, downloading the standard video instead:", err);
      return null;
    }
  });
  // Keep the turn, not the result: the chain must not pin the last file's URL.
  vp9Turn = built.then(() => undefined);
  return built;
}

/**
 * Turns a download source into a URL `chrome.downloads.download` accepts in
 * this browser. An HTTPS URL passes through. For in-memory data the two
 * browsers need opposite answers:
 *
 *  - **Firefox** rejects every `data:` URL ("Access denied for URL data:…"),
 *    but its background page can mint a `blob:` URL, which is same-origin to
 *    the extension and therefore downloadable. So a `data:` URL sent by a
 *    content script is re-minted as a `blob:` URL, and so is a file built here.
 *  - **Chrome**'s service worker has no `URL.createObjectURL`, and its
 *    downloads API accepts `data:` URLs. So a `data:` URL passes through, and
 *    a file built here becomes one.
 *
 * A `blob:` URL minted here never came from a message, which is what makes it
 * safe: it is not the page-scoped kind the handlers reject.
 */
async function mintDownloadUrl(source: string | Blob): Promise<MintedUrl> {
  const canMintBlobUrl = typeof URL.createObjectURL === "function";
  let blob: Blob;
  if (typeof source !== "string") {
    blob = source;
  } else if (canMintBlobUrl && source.startsWith("data:")) {
    blob = await (await fetch(source)).blob();
  } else {
    return { url: source, release: null };
  }
  if (!canMintBlobUrl) return { url: await blobToDataUrl(blob), release: null };
  const url = URL.createObjectURL(blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}

/**
 * Frees a minted `blob:` URL once its download leaves `in_progress`. The
 * listener is registered mid-event on purpose — the one exception to
 * "listeners at module scope": it only has to live as long as this
 * background page does, because unloading the page frees the blob too.
 */
function releaseWhenSettled(downloadId: number, release: () => void): void {
  let released = false;
  const settle = (state: string | undefined): void => {
    if (released || (state !== "complete" && state !== "interrupted")) return;
    released = true;
    chrome.downloads.onChanged.removeListener(onChanged);
    release();
  };
  const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
    if (delta.id === downloadId) settle(delta.state?.current);
  };
  try {
    chrome.downloads.onChanged.addListener(onChanged);
    // A small file can finish before the listener exists. Ask once, so that
    // blob isn't held until the page unloads — which, with one download after
    // another keeping the page alive, could be a long time.
    chrome.downloads.search({ id: downloadId }).then(
      ([item]) => settle(item?.state),
      () => undefined,
    );
  } catch {
    // The download has already started: failing to schedule the cleanup must
    // not turn it into an error. The blob is freed when the page unloads.
  }
}

/**
 * Error text for a response. Capped because Firefox quotes the whole
 * offending URL in its message — megabytes of base64 for a `data:` URL —
 * and the sender shows the text in a toast.
 */
function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message;
}
