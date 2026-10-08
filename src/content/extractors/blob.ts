import { blobToDataUrl } from "../../utils/blob";

/**
 * Resolves a `blob:` URL the content script holds (i.e. minted by the page's
 * own document) into a data URL the service worker can hand to
 * `chrome.downloads.download`. Returns `null` on fetch / read failure so the
 * caller can fail loudly with a context-aware message.
 *
 * MUST run inside the content script — the SW context is not same-origin to
 * the Instagram document and `fetch("blob:https://www.instagram.com/...")`
 * fails there with "Access denied for URL".
 *
 * @example
 * const dataUrl = await resolveBlobUrlToDataUrl("blob:https://www.instagram.com/uuid");
 * if (dataUrl) await sendMessage({ type: "DOWNLOAD_MEDIA", resource: { url: dataUrl, ... } });
 */
export async function resolveBlobUrlToDataUrl(blobUrl: string): Promise<string | null> {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (err) {
    console.warn("[igdl] resolveBlobUrlToDataUrl", err);
    return null;
  }
}

/**
 * Type guard for `blob:` URLs. Centralizes the predicate so reviewers grepping
 * for blob handling find one place.
 *
 * @example
 * if (isBlobUrl(url)) {
 *   url = await resolveBlobUrlToDataUrl(url) ?? url;
 * }
 */
export function isBlobUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("blob:");
}
