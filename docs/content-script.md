# Content script

How igdl turns a page load on Instagram or Threads into an injected download button, captures network media URLs, and runs modals/toasts inside a Shadow DOM. Three concerns, one doc:

1. **Routing** — the polling loop and per-route handler dispatch.
2. **XHR interception** — capturing media URLs from Instagram's API responses.
3. **Shadow DOM mount** — isolating injected UI from Instagram's DOM.

## Entry and platform branch

`src/content/index.ts` is the content-script entry. On every tick it checks `window.location.origin`:

- `https://www.threads.com` → delegates to `handleThreads()` (only when `setting_enable_threads` is on).
- `https://www.instagram.com` → runs the Instagram surface dispatch.
- Anything else → no-op (the manifests gate this, but the runtime check is a defensive backstop).

`init()` (`src/content/index.ts:278`) does three things on load:
1. `initStorageCache()` — pre-warms the settings cache the click handlers read synchronously.
2. `prewarmModalMount()` — creates a Shadow DOM mount eagerly so the no-directory popup has zero perceived latency.
3. Wires `window.addEventListener("message", …)` for the XHR-snapshot bridge (see below) and global `click` + `contextmenu` listeners for the button delegator.

## Polling and route detection

```ts
let earlyCount = 0;
const earlyTimer = setInterval(() => {
  processPage();
  if (++earlyCount >= 5) clearInterval(earlyTimer);
}, 2000);
setInterval(processPage, 3 * 1000);
processPage();
```

That's the whole route-detection mechanism: 2 s burst for the first 10 s, then 3 s steady state. There are no `pushState`/`popstate` hooks. Instagram's React tree renders in waves and sometimes mounts the like button after the URL has changed; polling races correctness over event purity.

`processPage()` parses `window.location.pathname` and branches: `/` and `/feed/` (article list), `/p/`, `/reel/`, `/stories/`, `/reels/`, profile pages. Each branch:

1. Locates an anchor element (typically the like icon's `<svg path>`) via a hard-coded `path[d="…"]` selector.
2. Walks parent elements to the action-bar container.
3. Skips if the container already has a `.${CLASS_CUSTOM_BUTTON}` child.
4. Otherwise calls `addCustomBtn()`/`addVideoDownloadCoverBtn()` from `src/content/button.ts`.

## Per-route handlers

| Surface | URL pattern | Handler file | What it injects |
| --- | --- | --- | --- |
| Feed | `/`, `/feed/` | `processPage()` inline + `handlers/post.ts` | Download button next to the like icon on each `<article>`. |
| Post detail | `/p/:id`, `/?/feed`-style detail | `handlers/post.ts` | Download button next to the like icon (in dialog or main section). |
| Reels feed | `/reels/` | `handlers/reels.ts` | Download button on each reel card. |
| Reel detail | `/reel/:id` | `handlers/reels.ts` | Download button in the reel action bar. |
| Stories | `/stories/:user/:id` | `handlers/stories.ts` | Download button near the story menu (white icon, dark backdrop). |
| Highlight modal | profile → highlights | `handlers/highlights.ts` | Download button on the active highlight item. |
| Profile avatar | any profile path | `handlers/profile.ts` | Download button on the avatar action group. |
| Profile grid | `/:user`, `/:user/reels`, `/:user/tagged` | `handlers/profile-reel.ts` | Download overlay on each video cover thumbnail. |
| Carousel ZIP | wherever a carousel is detected | `handlers/zip.ts` | A second "download as zip" button next to the standard one. |
| Threads | any threads.com path | `threads/index.ts` + `threads/post.ts` | Download button on each `data-pagelet`. |

The button class is `igdl-custom-btn` (`button.ts:CLASS_CUSTOM_BUTTON`). Clicks bubble up to the document-level delegator in `src/content/index.ts:266`, which calls `onClickHandler()` and routes through the download flow at `src/content/flow/download.tsx` — see `download-flow.md`.

## Extractors

`src/content/extractors/` turns a clicked button + the page state into a `MediaResource`:

- `fn.ts` — `getDataFromAPI()` calls `/api/v1/media/{id}/info/` directly; `getUrlFromInfoApi()` parses the response. ID extraction from `pathname` or `<a href>`. Page-type detection (`pc`/`mobile`).
- `video.ts` — `handleVideo()` re-enables HTML5 controls on `<video>` elements; volume sync between feed and stories/reels.
- `storage.ts` — synchronous settings cache. The button click handler can't `await`, so this projects `chrome.storage.local["igdl_settings"]` into a `storageCache.canonical` object on init and keeps it updated via `chrome.storage.onChanged`.
- `dom.ts` — recursive parent walker for finding the enclosing `<article>` / `<section>`.
- `filename.ts` — URL stem and extension inference.

For surfaces where the API call would be redundant or lossy (carousel posts where Instagram has already shipped the URLs in a GraphQL response, or highlight reels), the handler instead resolves through `MediaCacheService` — populated by the XHR-interception layer.

## XHR interception

Instagram serves most media URLs (especially video) as **short-lived signed URLs** that never enter the DOM. They live only inside `/api/v1/feed/timeline/`, `/api/v1/media/<id>/info/`, GraphQL responses, etc. To get reliable URLs without re-issuing the API call, the extension intercepts those responses live.

### Where it runs

`src/inject.ts` runs in the **page's main world**, where `XMLHttpRequest` and `fetch` are the same identities Instagram itself uses. Loading paths differ per browser:

- **Chrome** — `content_scripts` entry with `world: "MAIN"` at `document_start` (Instagram only).
- **Firefox** — Firefox MV3 has no `world: "MAIN"`. `src/content/loader.ts` (a regular isolated content script) does:
  ```ts
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  ```
  `inject.js` is declared in `web_accessible_resources` so the page can fetch it.

### What it captures

`src/xhr.ts` exports `installXhrInterceptor({ onSnapshot, shouldCapture })`. It's idempotent (guarded by a `__igdl_xhr_installed__` global sentinel). The default `shouldCapture` only captures responses with `Content-Type: application/json` — anything else is left alone.

`patchXhr()` wraps `XMLHttpRequest.prototype.open/send`, stashing the URL on the instance and listening for `load`. `patchFetch()` replaces `globalThis.fetch` with a wrapper that `clone()`s the response and reads JSON in a fire-and-forget Promise — never blocking the caller.

### How the snapshot reaches the cache

```
inject.ts (MAIN world)                 content/index.ts (isolated)              background
                                                                            
xhr/fetch fires
   │
   ├─ onSnapshot({ endpoint, body })
   │
   └─ window.postMessage(
         { source: "igdl-xhr", endpoint, body },
         window.location.origin)
                                       │
                                       ▼
                                  message listener filters by source
                                       │
                                       └─ sendMessage({ type: "XHR_SNAPSHOT", endpoint, body })
                                                                                   │
                                                                                   ▼
                                                                        routeMessage → 
                                                                        mediaCache.ingestXhrSnapshot()
                                                                        dispatches by endpoint substring
                                                                        into post / reels / stories /
                                                                        highlight / username caches
```

Why the round-trip through the background? `MediaCacheService` is owned by the background so the cache lives across content-script re-injections (SPA navigations) and stays consistent between options page and content scripts. Content scripts only **read** from it.

The snapshot path swallows every error — page scripts must never see ours.

## Threads support

Threads doesn't run the inject script (`world: "MAIN"` is gated to instagram.com in the Chrome manifest). Instead:

- The Chrome manifest declares `externally_connectable.matches: ["*://*.threads.com/*"]`. Threads.com page scripts post via `chrome.runtime.onMessageExternal` to the background's Threads bridge (`src/background/shared/threads.ts`), which writes into the media cache.
- The content script's `handleThreads()` (`src/content/threads/index.ts`) detects `data-pagelet` divs (`threads_feed_*`, `threads_search_results_*`, `threads_profile_posts_timeline_*`, `threads_post_page_*`) and injects the same button family.
- `src/content/threads/post.ts` walks the page's inline JSON (`findFeedDataEdges()`) for media URLs as a DOM-side fallback when the bridge hasn't observed the post yet.
- Firefox has no `externally_connectable` — Threads support degrades to inline-JSON only on Firefox.

## Shadow DOM mount

Every modal and toast (`NoDirPopup`, `ToastService`'s stack, anything content-script-rendered) mounts through `createShadowMount()` at `src/content/modals/mount.ts`. The function captures three invariants:

### 1. Style isolation

```ts
const host = document.createElement("div");
host.setAttribute("data-igdl-shadow", "");
host.style.cssText = "position:fixed; inset:0; z-index:2147483647; pointer-events:none;";
document.documentElement.appendChild(host);

const shadow = host.attachShadow({ mode: "open" });
const container = document.createElement("div");
container.style.cssText = "pointer-events: auto;";
shadow.appendChild(container);
```

The host is a fixed full-viewport overlay with `pointer-events: none` so it doesn't intercept Instagram clicks; the inner container opts back into pointer events for actual modals. Z-index `2147483647` (`int32 max`) wins against anything Instagram raises. The shadow root is `mode: "open"` for testability.

**No CSS is injected into the shadow root.** Components style themselves inline from `src/content/tokens.ts`. Tailwind utilities don't reach inside; Instagram styles don't leak in.

### 2. Keyboard isolation

Instagram registers global shortcuts at the window level, some on the **capture phase** (`n` for new post, arrow keys for stories) and some on the **bubble phase** (`k`, `j`, `l`, `m` for video controls). When the user is typing into an input inside our modal, those shortcuts must not fire.

The mount registers six listeners — `keydown`, `keyup`, `keypress` on `window` (capture phase) plus the same three on the `host` (bubble phase). Each guard checks:

```ts
if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return;
if (!event.composedPath().includes(host)) return;
event.stopPropagation();
```

Window-capture stops descent through the capture phase before reaching Instagram's listeners; the target phase still fires on the input so character insertion, Escape, and Enter all work. Host-bubble is defense-in-depth for any window-level capture handlers that register after ours. The `composedPath().includes(host)` check ensures one mount instance doesn't interfere with another's events.

### 3. Cleanup

`dispose()` calls `render(null, container)` to unmount the Preact tree, removes all keyboard listeners, and removes the host from the document. Idempotent — safe to call during page unload even if no modal was ever rendered.

## Pre-warming

`src/content/downloadBridge.ts:prewarmModalMount()` creates a shadow mount eagerly during init and refreshes it after each use. The first paint of `NoDirPopup` would otherwise involve creating a host, attaching a shadow root, and registering six event listeners on the click — pre-warming hides that work.
