/**
 * Firefox-only bootstrap: injects `inject.js` into the page's script context
 * because Firefox MV3 doesn't support `content_scripts` with `world: "MAIN"`.
 *
 * Runs as a regular isolated content script, which gives us access to
 * `chrome.runtime.getURL` to resolve the extension URL for `inject.js`
 * (declared in `web_accessible_resources`).
 */

try {
  const url = chrome.runtime.getURL("inject.js");
  const script = document.createElement("script");
  script.src = url;
  script.type = "text/javascript";
  (document.head || document.documentElement).appendChild(script);
  script.remove();
} catch {
  // Firefox may block injection under strict CSP — content.js still runs and
  // the extension can degrade gracefully without the XHR interception layer.
}
