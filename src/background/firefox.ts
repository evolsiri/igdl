import { createMediaCacheService } from "../services/media-cache/media-cache";
import { createSettingsService } from "../services/settings/settings";
import { registerSharedBackground } from "./shared/register";

/**
 * Firefox MV3 background entry (declared as `background.scripts`). Registers
 * the shared handlers plus Firefox-specific scaffolding:
 *
 *  - `webRequest.filterResponseData` on Instagram endpoints — the registration
 *    call is installed below; per-endpoint decoders and `XHR_SNAPSHOT`
 *    forwarding to the active Instagram tab's content script are not yet
 *    implemented.
 *
 * Zip assembly lives entirely in the content script (see
 * `src/services/zip/`), so there is no background-side zip handler
 * on either Chrome or Firefox.
 */

const deps = {
  settings: createSettingsService(),
  mediaCache: createMediaCacheService(),
};

registerSharedBackground(deps);

const INSTAGRAM_FILTER_URLS = [
  "*://www.instagram.com/api/v1/*",
  "*://www.instagram.com/graphql/*",
  "*://i.instagram.com/api/v1/*",
];

try {
  if (chrome.webRequest?.onBeforeRequest) {
    chrome.webRequest.onBeforeRequest.addListener(
      () => {
        // TODO: call filterResponseData, accumulate the response body,
        // decode with TextDecoder, JSON.parse, then forward to the sender tab
        // as XHR_SNAPSHOT. Reference implementation:
        //   https://github.com/TheKonka/instagram-download-browser-extension/blob/main/src/background/firefox.ts
      },
      { urls: INSTAGRAM_FILTER_URLS, types: ["xmlhttprequest"] },
      ["blocking"],
    );
  }
} catch {
  // Firefox versions that don't support webRequestBlocking will throw here;
  // degrade gracefully — the extension keeps working without XHR capture.
}
