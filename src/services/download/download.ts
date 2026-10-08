import type { MediaResource } from "../../types/instagram";
import type { DownloadMediaResult } from "../../types/messages";
import { sendMessage } from "../../utils/messages";

/**
 * Outcome of `DownloadService.queue`. `transport` marks a failure where the
 * background never answered at all, as opposed to answering with an error.
 */
export type QueueResult =
  | ({ ok: true } & DownloadMediaResult)
  | { ok: false; error: string; transport?: true };

export interface DownloadService {
  /**
   * Queues a single media resource for download. Sends a `DOWNLOAD_MEDIA`
   * message to the background worker, which owns `chrome.downloads.download`
   * (per TAC-4.1). Never throws — surfaces transport and download errors as
   * `{ ok: false, error }`.
   *
   * When `resource.vp9` is set, the background remuxes that rendition and the
   * result's `usedVp9` reports whether the VP9 file (`true`) or the standard
   * fallback (`false`) was downloaded. The call takes as long as the fetch
   * and remux do, so show progress while awaiting it.
   *
   * @example
   * const result = await downloadService.queue(resource);
   * if (result.ok) showSuccessToast();
   * else showFailureToast(result.error);
   */
  queue(resource: MediaResource, options?: { saveAs?: boolean }): Promise<QueueResult>;
}

/**
 * Creates a DownloadService. Content scripts and options page both use it to
 * request downloads without ever touching `chrome.downloads.*` directly.
 *
 * @example
 * const downloadService = createDownloadService();
 * const result = await downloadService.queue(resource, { saveAs: true });
 */
export function createDownloadService(): DownloadService {
  return {
    async queue(resource, options) {
      const response = await sendMessage<DownloadMediaResult>({
        type: "DOWNLOAD_MEDIA",
        resource,
        saveAs: options?.saveAs,
      });
      if (!response.ok) return response;
      return { ok: true, ...response.data };
    },
  };
}
