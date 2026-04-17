import type { ThreadsExternalMessage } from "../../types/messages";
import type { BackgroundDeps } from "./deps";

/**
 * Registers the `externally_connectable` handler that receives media payloads
 * from threads.com page scripts and funnels them into `MediaCacheService`.
 * Returns an unsubscribe function.
 *
 * @example
 * const off = registerThreadsBridge({ settings, mediaCache });
 * // later, in tests
 * off();
 */
export function registerThreadsBridge(deps: BackgroundDeps): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean => {
    if (!isThreadsMessage(message)) {
      sendResponse({ ok: false, error: "unexpected external message" });
      return false;
    }
    deps.mediaCache
      .ingestXhrSnapshot(message.endpoint, message.body)
      .then(() => sendResponse({ ok: true, data: null }))
      .catch((err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    return true; // keep async channel open
  };

  chrome.runtime.onMessageExternal.addListener(listener);
  return () => chrome.runtime.onMessageExternal.removeListener(listener);
}

function isThreadsMessage(value: unknown): value is ThreadsExternalMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as { type?: unknown; endpoint?: unknown };
  return m.type === "THREADS_MEDIA" && typeof m.endpoint === "string";
}
