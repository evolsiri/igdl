# Architecture

This document describes how `igdl`'s modules interact at runtime. It covers the module map, the message bus, the storage contract, the XHR-interception layer, and the Threads bridge. Start here if you want to understand how a click on the injected download button actually triggers a download.

## Module map

```
┌────────────────────────────────────────────────────────────────┐
│ Manifest (MV3, Chrome + Firefox)                               │
└──────────────┬─────────────────────────────┬───────────────────┘
               │                             │
               ▼                             ▼
   ┌──────────────────────┐      ┌───────────────────────┐
   │ Background           │      │ Content Script        │
   │  (service_worker /   │◀────▶│  (runs on IG/Threads) │
   │   scripts)           │      │                       │
   │  • chrome.downloads  │      │  • Polls DOM every 3s │
   │  • message router    │      │  • Injects buttons    │
   │  • Threads bridge    │      │  • Handles clicks     │
   │  • webRequest (FF)   │      │  • Mounts modals      │
   └──────────────────────┘      │    in Shadow DOM      │
                                 └───────────┬───────────┘
                                             │
           ┌─────────────────────────────────┼──────────────────┐
           ▼                                 ▼                  ▼
   ┌──────────────────────┐      ┌──────────────────────┐  ┌────────────────┐
   │ Options Page         │      │ Services (shared)    │  │ Utils          │
   │  (options.html)      │◀────▶│  • SettingsService   │  │ • filename     │
   │  • Preact root       │      │  • MediaCacheService │  │ • path-join    │
   │  • 6 cards           │      │  • DownloadService   │  │ • dom-find     │
   │  • Theme mgmt        │      │  • ToastService      │  │ • format-date  │
   └──────────────────────┘      │  • ThemeService      │  └────────────────┘
                                 └──────────────────────┘
```

### Who owns what

- **`chrome.downloads.*`** — only `src/background/shared/downloads.ts` calls it. Enforced by the `code-reviewer` agent.
- **`chrome.storage.*`** — only `src/services/settings/storage.ts` and (via the same adapter) `src/services/media-cache/media-cache.ts` call it. Everyone else goes through the services.
- **`chrome.runtime.sendMessage`** — only `src/utils/messages.ts` and `src/background/shared/router.ts` call it. Callers use the typed wrapper.
- **DOM mutation** — only content-script handlers + Preact render. Shadow-DOM boundaries keep injected UI isolated.
- **Theme class toggling** — only `src/services/theme/theme.ts`. It never touches storage (`SettingsService` does, and notifies via `subscribe`).

## Message bus

All cross-context communication flows through `chrome.runtime.sendMessage`. Payloads are narrowed to the `Message` union in `src/types/messages.ts`:

| Type | Sender | Receiver | Purpose |
|---|---|---|---|
| `DOWNLOAD_MEDIA` | content script, options page | background | Kick off a `chrome.downloads.download` for one resource. Optional `saveAs?: boolean` triggers the OS Save As dialog. |
| `OPEN_URL` | content script | background | Opens the URL in a new tab (Open-in-new-tab icon). |
| `XHR_SNAPSHOT` | background (Firefox) | content script | Forwards a decoded XHR response captured by `webRequest`. |

Every handler returns a `MessageResponse<T>`:
```ts
{ ok: true; data: T } | { ok: false; error: string }
```

No thrown errors ever cross the message bus. Callers inspect `ok` to decide.

### Request/response flow for a download click

```
content/handlers/post.ts
  ─▶ extracts MediaResource[] from the DOM
  ─▶ calls handleDownloadClick(resources, deps)   ─▶ content/flow/download.tsx
                                                       │
                                                       ▼
                                   either silent download or NoDirPopup
                                                       │
                                                       ▼
                                                download.queue(r)        ─▶ DownloadService
                                                       │                     │
                                                       ▼                     ▼
                                         sendMessage(DOWNLOAD_MEDIA)   background/shared/router.ts
                                                                             │
                                                                             ▼
                                                           handleDownloadMedia → chrome.downloads
                                                                             │
                                                                             ▼
                                                              increments profile's downloadCount
                                                                      via SettingsService
```

### Right-click / Save As flow

Right-clicking the injected download button fires `handleGlobalContextMenu`
in `src/content/index.ts`, which calls `onClickHandler(btn, true)`. The
`saveAs = true` flag threads through each surface handler →
`downloadViaFlow(params, true)` → `download.queue(resource, { saveAs: true })`
→ `DOWNLOAD_MEDIA` with `saveAs: true` → `chrome.downloads.download({ saveAs: true })`.

This path **never** opens a modal — no NoDirPopup, no profile-directory check.
The OS Save As dialog is the only UI.

## Storage contract

Two distinct concerns, both on `chrome.storage.local`:

### Settings (single blob)

- Key: `igdl_settings`
- Shape: `Settings` type in `src/types/settings.ts`
- Writes from any context (options, content, background) broadcast via `chrome.storage.onChanged`.
- `SettingsService.subscribe(listener)` filters to this key and re-hydrates the blob through the schema migration.

### Media caches (7 keys)

- Prefix: `igdl_cache_`
- Keys: `idToUsernameMap`, `userProfilePicUrl`, `storiesReelsMedia`, `reelsEdgesData`, `postMedia`, `highlightMedia`, `threadsPostMedia` — see `src/services/media-cache/keys.ts`.
- Cleared on `chrome.runtime.onStartup` (TAC-5.4) — caches are ephemeral.
- Writes only via `MediaCacheService.ingestXhrSnapshot(endpoint, body)` (TAC-5.5).
- Reads only via the resolver API (`resolveMediaFor*` + `getUsernameForPost`); raw-cache helpers are module-private (TAC-4.7).

## XHR-interception layer

Instagram serves many media URLs (especially videos) as short-lived, session-scoped signed URLs that aren't in the DOM. We capture them by patching the page's own `XMLHttpRequest` and `fetch` in the **page world**, mirroring the reference extension.

Files:
- `src/xhr.ts` — `installXhrInterceptor(options)`. Patches XHR + fetch. Idempotent via a global sentinel.
- `src/inject.ts` — calls `installXhrInterceptor` and forwards every snapshot via `window.postMessage({ source: "igdl-xhr", endpoint, body })`.

### Chrome path

`chrome.manifest.json` declares `inject.js` as a `content_scripts` entry with `world: "MAIN"` and `run_at: "document_start"`. The browser runs it in the page world; no `chrome.*` API is available there, which is fine because all we do is postMessage.

### Firefox path

Firefox MV3 doesn't support `world: "MAIN"`. Instead:

1. `src/content/loader.ts` runs in the isolated world at `document_start`.
2. It appends a `<script src={chrome.runtime.getURL("inject.js")}>` tag to the page. `inject.js` is declared in `web_accessible_resources`.
3. The page context executes `inject.js`, which patches XHR and postMessages snapshots.

Firefox also registers `chrome.webRequest.filterResponseData` in `src/background/firefox.ts` as a belt-and-suspenders fallback for endpoints the page-level patch misses.

### Ingestion

The isolated-world content script (`src/content/index.ts`) listens for both:
- `window` `message` events with `source === "igdl-xhr"` (Chrome + Firefox happy path)
- `chrome.runtime.onMessage` with `type === "XHR_SNAPSHOT"` (Firefox `webRequest` fallback)

Both routes funnel into `MediaCacheService.ingestXhrSnapshot(endpoint, body)`, which dispatches on endpoint substring (e.g. `/api/v1/users/web_profile_info/` populates `userProfilePicUrl`).

## Threads bridge

Threads.com runs a different origin. The reference extension coordinates via `chrome.runtime.onMessageExternal`:

1. `chrome.manifest.json` + `firefox.manifest.json` declare `externally_connectable.matches = ["*://*.threads.com/*"]`.
2. A page script on `threads.com` (injected the same way as Instagram's `inject.js`) captures Threads' own XHRs and posts them back via `chrome.runtime.sendMessage({ type: "THREADS_MEDIA", endpoint, body }, EXTENSION_ID)`.
3. `src/background/shared/threads.ts` receives the external message, validates the shape, and funnels the body into `MediaCacheService.ingestXhrSnapshot`.
4. When the user clicks a Threads download button, `src/content/handlers/threads.ts` calls `MediaCacheService.resolveMediaForThreadsPost(postId)` and hands off to `handleDownloadClick`.

Only threads.com pages can connect. Everything else bounces.

## Design system

The visual + interaction language is centralised in two places:

- **`src/index.css`** — CSS custom properties for the options-page (Tailwind v4 theme block + `:root.dark` overrides). Covers surfaces, text, accent, destructive, toasts, focus, radii (all `0`), motion durations, and ease curves.
- **`src/content/tokens.ts`** — TypeScript `TOKENS` and `MOTION` constants for content-script UI. Dark-palette only (shadow-mounted injected UI renders on Instagram / Threads and must read well regardless of the host theme).

Both are indexed and visualised by the **`Design System/*` Storybook stories** (`src/stories/DesignSystem.stories.tsx`), which are the source of truth for what exists and how it looks. `docs/design-system.md` is the pointer + contribution contract — read it before adding a new token or component so the story stays complete.

## Injected-UI isolation

Every content-script-rendered component mounts inside a Shadow DOM (`src/content/modals/mount.ts`):

- `createShadowMount()` appends a fixed-position host to `document.documentElement` with `z-index: 2147483647`.
- `host.attachShadow({ mode: "open" })` gives a scoped root.
- Preact renders into the shadow root.
- Inline styles via `src/content/tokens.ts` — no Tailwind utility classes inside the shadow root; the reset and tokens come as plain CSS values. Tailwind (and Instagram's CSS) can't affect the content, and our styles can't leak out.

## Polling loop

`src/content/index.ts` runs the reference-derived polling loop:

```ts
function tick() {
  if ("requestIdleCallback" in window) window.requestIdleCallback(processPage);
  else processPage();
}
tick();                         // immediate first pass
setInterval(tick, 3000);        // every 3s while idle
beforeunload → clearInterval
```

`processPage` routes to surface handlers based on `window.location.pathname` (see `src/content/selectors.ts` for predicates). Each handler is idempotent: it checks for its sentinel attribute before injecting and skips already-processed containers.

## Lifecycle

| Event | Chrome (SW) | Firefox (bg scripts) | What happens |
|---|---|---|---|
| `onInstalled` | ✓ | ✓ | No-op — services lazy-init on first `get()`. |
| `onStartup` | ✓ | ✓ | `MediaCacheService.clearAll()` — media caches are ephemeral. |
| `onMessage` | ✓ | ✓ | `routeMessage` dispatches by `Message.type`. Returns `true` to keep the async channel open. |
| `onMessageExternal` | ✓ | ✓ | Threads bridge funnels into MediaCache. |
| `action.onClicked` | ✓ | ✓ | Opens the options page via `openOptionsPage()`. Toolbar icon has no popup. |

Chrome's SW may terminate any time; every handler is idempotent and reads authoritative state from storage rather than in-memory mirrors.

## Cross-browser divergences at a glance

| Concern | Chrome | Firefox |
|---|---|---|
| Background form | `service_worker` (module) | `scripts` array |
| Page-world XHR patch | `content_scripts` w/ `world: "MAIN"` | `content/loader.ts` injects `<script>` |
| API-response fallback | N/A | `webRequest.filterResponseData` |
| Carousel ZIP build | Content script (`ZipService` + anchor-click, no background involvement) | Content script (`ZipService` + anchor-click, no background involvement) |
| Options surface | `options_page` | `options_ui` with `open_in_tab: true` |
| Extra permissions | — | `webRequest`, `webRequestBlocking`, `webRequestFilterResponse` |
| Store distribution | `.zip` → Chrome Web Store | `.xpi`/`.zip` via `web-ext build` → AMO |

## Where each top-level concern lives

- Run options-page bootstrap: `src/options/main.tsx` → `App.tsx`.
- Handle an incoming download request on the wire: `src/background/shared/router.ts`.
- Decide where a file lands on disk: `src/services/download/naming.ts`.
- Resolve a post's author username at click time: `MediaCacheService.getUsernameForPost(postId)` (PLAN round 7 decision 30).
- Decide whether to show the no-directory popup: `src/content/flow/download.tsx` — `handleDownloadClick`.

If you need to add a new surface to the extension (say, Instagram Live), create `src/content/handlers/live.ts` mirroring the existing handler skeletons, wire it into the URL dispatch in `src/content/index.ts`, and add a resolver to `MediaCacheService` if its media URLs come from a distinct endpoint.
