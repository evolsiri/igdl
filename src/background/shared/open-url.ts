import type { Message, MessageResponse } from "../../types/messages";

type OpenUrlMessage = Extract<Message, { type: "OPEN_URL" }>;

/**
 * Handles `OPEN_URL` — opens the URL in a new tab next to the sender. Used
 * by the "open in new tab" icon sibling to the download button.
 *
 * @example
 * await handleOpenUrl({ type: "OPEN_URL", url: "https://example.com" });
 */
export async function handleOpenUrl(
  message: OpenUrlMessage,
): Promise<MessageResponse<{ tabId: number | null }>> {
  try {
    const tab = await chrome.tabs.create({ url: message.url });
    return { ok: true, data: { tabId: tab.id ?? null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
