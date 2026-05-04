import { buildFullPath } from "../../services/download/naming";
import type { Message, MessageResponse } from "../../types/messages";
import type { BackgroundDeps } from "./deps";

type DownloadMediaMessage = Extract<Message, { type: "DOWNLOAD_MEDIA" }>;
type DownloadZipMessage = Extract<Message, { type: "DOWNLOAD_ZIP" }>;

/**
 * Handles `DOWNLOAD_MEDIA`. Computes the full relative path via
 * `DownloadService` naming helpers, invokes `chrome.downloads.download`, and
 * bumps the profile's `downloadCount` + `lastDownloadAt` on success. Never
 * throws — returns a discriminated `MessageResponse`.
 *
 * **URL contract.** `resource.url` MUST be HTTPS (Instagram CDN) or `data:`
 * (content-script-converted blob). `blob:` URLs are rejected here because
 * they are origin-scoped to the document that minted them; the SW context
 * has no access to dereference them and `chrome.downloads.download` returns
 * a cryptic "Type error for parameter options". Content scripts are
 * responsible for converting `blob:` to `data:` via
 * `src/content/extractors/blob.ts:resolveBlobUrlToDataUrl` before sending.
 *
 * @example
 * const r = await handleDownloadMedia({ type: "DOWNLOAD_MEDIA", resource }, deps);
 * if (r.ok) console.log("queued", r.data.downloadId);
 */
export async function handleDownloadMedia(
  message: DownloadMediaMessage,
  deps: BackgroundDeps,
): Promise<MessageResponse<{ downloadId: number }>> {
  if (message.resource.url.startsWith("blob:")) {
    return {
      ok: false,
      error: "cannot download blob: URL — content script must convert it to a data URL first",
    };
  }
  try {
    const settings = await deps.settings.get();
    const filename = buildFullPath(message.resource, settings);
    const downloadId = await chrome.downloads.download({
      url: message.resource.url,
      filename,
      saveAs: message.saveAs ?? settings.alwaysPromptSaveAs,
    });
    await deps.settings.incrementDownload(message.resource.username);
    return { ok: true, data: { downloadId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Handles `DOWNLOAD_ZIP`. Receives a base64 data URL built in the content
 * script (blob URLs are origin-scoped and cannot cross the SW boundary) and
 * hands it to `chrome.downloads`. Never throws.
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
  if (message.dataUrl.startsWith("blob:")) {
    return {
      ok: false,
      error: "cannot download blob: URL — content script must convert it to a data URL first",
    };
  }
  try {
    const downloadId = await chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename,
      saveAs: message.saveAs ?? false,
    });
    return { ok: true, data: { downloadId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
