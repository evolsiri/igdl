import type { XhrPageMessage } from "./types/messages";
import { installXhrInterceptor } from "./xhr";

/**
 * Entry point loaded into the PAGE world. Installs the XHR/fetch patcher
 * and forwards every captured snapshot to the isolated content script via
 * `window.postMessage`. The content script filters by `source: "igdl-xhr"`
 * and writes into `MediaCacheService`.
 *
 * On Chrome this file is loaded via `content_scripts` with `world: "MAIN"`
 * at `document_start`. On Firefox it's loaded by `content/loader.ts`, which
 * appends a `<script src="inject.js">` tag (Firefox MV3 lacks `world:MAIN`).
 */

installXhrInterceptor({
  onSnapshot: ({ endpoint, body }) => {
    const message: XhrPageMessage = { source: "igdl-xhr", endpoint, body };
    window.postMessage(message, window.location.origin);
  },
});
