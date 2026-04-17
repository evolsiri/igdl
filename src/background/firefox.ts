import { createMediaCacheService } from "../services/MediaCacheService";
import { createSettingsService } from "../services/SettingsService";
import { registerSharedBackground } from "./shared/register";

/**
 * Firefox MV3 background entry (declared as `background.scripts`). Registers
 * the shared handlers plus Firefox-specific scaffolding:
 *
 *  - `webRequest.filterResponseData` on Instagram endpoints — the registration
 *    call is installed below; per-endpoint decoders and `XHR_SNAPSHOT`
 *    forwarding to the active Instagram tab's content script are not yet
 *    implemented.
 *  - `ZIP_BUILD` handler — stub; zip.js integration is not yet implemented.
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
