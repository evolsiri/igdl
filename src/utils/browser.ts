/**
 * Returns the extension API root. Both Chrome and Firefox MV3 expose `chrome.*`
 * with promise-based APIs; this helper exists so tests can swap in fakes
 * without mutating globals.
 *
 * @example
 * const api = getBrowserApi();
 * await api.storage.local.set({ x: 1 });
 */
export function getBrowserApi(): typeof chrome {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) return chrome;
  const maybeBrowser = (globalThis as unknown as { browser?: typeof chrome }).browser;
  if (maybeBrowser && maybeBrowser.runtime?.id) return maybeBrowser;
  throw new Error("getBrowserApi: extension runtime API unavailable (not running inside an extension)");
}

/**
 * True when the current global has an extension runtime attached. Useful as a
 * guard before calling `getBrowserApi()` in code that may also run in the
 * options page preview or in tests.
 */
export function hasBrowserApi(): boolean {
  try {
    getBrowserApi();
    return true;
  } catch {
    return false;
  }
}
