import type { Message, MessageResponse } from "../../types/messages";
import type { BackgroundDeps } from "./deps";
import { handleDownloadMedia } from "./downloads";
import { handleOpenUrl } from "./open-url";

/**
 * Central dispatcher for `chrome.runtime.onMessage`. Maps each message type
 * to its handler. Unknown types return `{ ok: false, error }` rather than
 * throwing — keeps the message channel predictable for senders.
 */
export async function routeMessage(
  message: Message,
  deps: BackgroundDeps,
): Promise<MessageResponse> {
  switch (message.type) {
    case "DOWNLOAD_MEDIA":
      return handleDownloadMedia(message, deps);
    case "OPEN_URL":
      return handleOpenUrl(message);
    case "XHR_SNAPSHOT":
      await deps.mediaCache.ingestXhrSnapshot(message.endpoint, message.body);
      return { ok: true, data: null };
    case "ZIP_BUILD":
      // Firefox registers a real handler for this; Chrome handles zip in the
      // content script per PLAN.md round 6 decision 26.
      return { ok: false, error: "ZIP_BUILD not handled in this background" };
    default: {
      const _exhaustive: never = message;
      return { ok: false, error: `unknown message type: ${String((_exhaustive as { type?: unknown }).type)}` };
    }
  }
}

/**
 * Narrow a raw `chrome.runtime.onMessage` payload into a `Message`. Returns
 * null when the payload doesn't look like one of ours.
 */
export function asMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { type?: unknown };
  if (typeof candidate.type !== "string") return null;
  const t = candidate.type;
  if (
    t === "DOWNLOAD_MEDIA" ||
    t === "OPEN_URL" ||
    t === "XHR_SNAPSHOT" ||
    t === "ZIP_BUILD"
  ) {
    return raw as Message;
  }
  return null;
}
