import type { BackgroundDeps } from "./deps";
import { asMessage, routeMessage } from "./router";
import { registerThreadsBridge } from "./threads";

/**
 * Wires all common background handlers onto `chrome.runtime.*`. Called from
 * both `background/chrome.ts` and `background/firefox.ts`. Firefox-specific
 * additions (webRequest filters, ZIP handling) live in `background/firefox.ts`.
 *
 * @example
 * const deps = { settings: createSettingsService(), mediaCache: createMediaCacheService() };
 * registerSharedBackground(deps);
 */
export function registerSharedBackground(deps: BackgroundDeps): void {
  // Main message router — returns true to keep the async channel open.
  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const message = asMessage(raw);
    if (!message) {
      sendResponse({ ok: false, error: "malformed message" });
      return false;
    }
    routeMessage(message, deps).then(
      (response) => sendResponse(response),
      (err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
    );
    return true;
  });

  // Startup: clear ephemeral media caches (matches reference behavior).
  chrome.runtime.onStartup.addListener(() => {
    deps.mediaCache.clearAll().catch(() => {
      /* swallow — lifecycle handler must not throw */
    });
  });

  // First install / update: nothing to do yet; SettingsService lazy-inits.

  // Toolbar icon → options page.
  chrome.action?.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
  });

  // Threads.com bridge.
  registerThreadsBridge(deps);
}
