import type { MediaResource } from "../../types/instagram";
import { sendMessage } from "../../utils/messages";

export interface DownloadService {
  /**
   * Queues a single media resource for download. Sends a `DOWNLOAD_MEDIA`
   * message to the background worker, which owns `chrome.downloads.download`
   * (per TAC-4.1). Never throws — surfaces transport and download errors as
   * `{ ok: false, error }`.
   *
   * @example
   * const result = await downloadService.queue(resource);
   * if (result.ok) showSuccessToast();
   * else showFailureToast(result.error);
   */
  queue(
    resource: MediaResource,
    options?: { saveAs?: boolean },
  ): Promise<{ ok: true; downloadId: number } | { ok: false; error: string }>;
}

/**
 * Creates a DownloadService. Content scripts and options page both use it to
 * request downloads without ever touching `chrome.downloads.*` directly.
 */
export function createDownloadService(): DownloadService {
  return {
    async queue(resource, options) {
      const response = await sendMessage<{ downloadId: number }>({
        type: "DOWNLOAD_MEDIA",
        resource,
        saveAs: options?.saveAs,
      });
      if (!response.ok) return response;
      return { ok: true, downloadId: response.data.downloadId };
    },
  };
}
