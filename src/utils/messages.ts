import type { Message, MessageResponse } from "../types/messages";

/**
 * Typed wrapper around `chrome.runtime.sendMessage`. Always resolves with a
 * discriminated `MessageResponse` — never throws. Surfaces transport errors
 * (extension reloaded, no receiver, etc.) as `{ ok: false, error }`.
 *
 * @example
 * const response = await sendMessage({ type: "DOWNLOAD_MEDIA", resource });
 * if (response.ok) console.log("download started");
 * else console.error("download failed:", response.error);
 */
export async function sendMessage<T = unknown>(
  message: Message,
): Promise<MessageResponse<T>> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as unknown;
    if (
      response &&
      typeof response === "object" &&
      "ok" in (response as Record<string, unknown>)
    ) {
      return response as MessageResponse<T>;
    }
    return { ok: false, error: "malformed response from background" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
