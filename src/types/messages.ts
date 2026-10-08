import type { MediaResource } from "./instagram";

/**
 * Discriminated union of every cross-context message carried over
 * `chrome.runtime.sendMessage`. Senders live in content scripts or the options
 * page; handlers live in the background service worker / scripts.
 *
 * Every handler must return a `MessageResponse`. Never throw — surface errors
 * via `{ ok: false, error }` so the sender can decide how to react.
 */
export type Message =
  | { type: "DOWNLOAD_MEDIA"; resource: MediaResource; saveAs?: boolean }
  | { type: "DOWNLOAD_ZIP"; dataUrl: string; filename: string; saveAs?: boolean }
  | { type: "OPEN_URL"; url: string }
  | { type: "XHR_SNAPSHOT"; endpoint: string; body: unknown };

export type MessageResponse<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /**
       * Set by `sendMessage` when the failure is the channel itself — the
       * background never answered (it was reloaded, or unloaded mid-request)
       * or answered with something that isn't a response. Absent when a
       * handler ran and reported an error.
       */
      transport?: true;
    };

/** Success payload of `DOWNLOAD_MEDIA`. */
export interface DownloadMediaResult {
  downloadId: number;
  /**
   * Set only when the resource carried a `vp9` rendition: `true` when the
   * remuxed VP9 file was downloaded, `false` when the remux failed and the
   * standard video (`resource.url`) was downloaded instead.
   */
  usedVp9?: boolean;
}

/** Payload shape posted by the page-context xhr.ts via window.postMessage. */
export interface XhrPageMessage {
  source: "igdl-xhr";
  endpoint: string;
  body: unknown;
}

/**
 * Payload shape accepted over `chrome.runtime.onMessageExternal` from
 * threads.com page scripts. The bridge is gated by `externally_connectable`.
 */
export interface ThreadsExternalMessage {
  type: "THREADS_MEDIA";
  endpoint: string;
  body: unknown;
}
