import type { Message, MessageResponse } from "../../types/messages";
import type { BackgroundDeps } from "./deps";
import { handleDownloadMedia, handleDownloadZip } from "./downloads";
import { handleOpenUrl } from "./open-url";

/**
 * Central dispatcher for `chrome.runtime.onMessage`. Maps each message type
 * to its handler. Unknown types return `{ ok: false, error }` rather than
 * throwing — keeps the message channel predictable for senders.
 *
 * @example
 * chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
 *   const message = asMessage(raw);
 *   if (!message) return false;
 *   routeMessage(message, deps).then(sendResponse);
 *   return true; // async response
 * });
 */
export async function routeMessage(
  message: Message,
  deps: BackgroundDeps,
): Promise<MessageResponse> {
  switch (message.type) {
    case "DOWNLOAD_MEDIA":
      return handleDownloadMedia(message, deps);
    case "DOWNLOAD_ZIP":
      return handleDownloadZip(message);
    case "OPEN_URL":
      return handleOpenUrl(message);
    case "XHR_SNAPSHOT":
      await deps.mediaCache.ingestXhrSnapshot(message.endpoint, message.body);
      return { ok: true, data: null };
    default: {
      const _exhaustive: never = message;
      return { ok: false, error: `unknown message type: ${String((_exhaustive as { type?: unknown }).type)}` };
    }
  }
}

/**
 * Narrow a raw `chrome.runtime.onMessage` payload into a `Message`. Returns
 * null when the payload doesn't look like one of ours.
 *
 * @example
 * const message = asMessage(raw);
 * if (message) {
 *   routeMessage(message, deps);
 * }
 */
export function asMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { type?: unknown };
  if (typeof candidate.type !== "string") return null;
  const t = candidate.type;
  if (t === "DOWNLOAD_MEDIA" || t === "DOWNLOAD_ZIP" || t === "OPEN_URL" || t === "XHR_SNAPSHOT") {
    return raw as Message;
  }
  return null;
}
