import { buildFullPath } from "../../services/download/naming";
import type { Message, MessageResponse } from "../../types/messages";
import type { BackgroundDeps } from "./deps";

type DownloadMediaMessage = Extract<Message, { type: "DOWNLOAD_MEDIA" }>;

/**
 * Handles `DOWNLOAD_MEDIA`. Computes the full relative path via
 * `DownloadService` naming helpers, invokes `chrome.downloads.download`, and
 * bumps the profile's `downloadCount` + `lastDownloadAt` on success. Never
 * throws — returns a discriminated `MessageResponse`.
 *
 * @example
 * const r = await handleDownloadMedia({ type: "DOWNLOAD_MEDIA", resource }, deps);
 * if (r.ok) console.log("queued", r.data.downloadId);
 */
export async function handleDownloadMedia(
  message: DownloadMediaMessage,
  deps: BackgroundDeps,
): Promise<MessageResponse<{ downloadId: number }>> {
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
