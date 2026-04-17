# Content-script routing

How `src/content/index.ts` turns a page load on Instagram (or Threads) into an injected download button on each media surface. The content script is organized as a **poll loop + surface dispatch + click delegator**; this doc maps surfaces to handlers and explains the dispatch.

## The poll loop

The content-script entry (`src/content/index.ts`) bootstraps once per page:

1. **Load settings** — `initStorageCache()` populates an in-memory snapshot of the reference-compat `storageCache` (source of truth is `SettingsService`; see `src/content/extractors/storage.ts`).
2. **Prewarm modal mount** — creates the Shadow DOM host early so the first NoDirPopup click isn't the first paint. See [`shadow-dom-mount.md`](./shadow-dom-mount.md).
3. **Start polling** — every 3 s calls `processPage()` inside `requestIdleCallback` (falls back to direct call if unavailable). One immediate call happens at boot so the user doesn't wait 3 s on a fresh load.
4. **Register click delegator** — one `click` + one `contextmenu` listener on `document.body` route every click on any `.igdl-btn` through `onClickHandler` (see `src/content/button.ts`).

The 3 s cadence is chosen to balance DOM mutation latency (Instagram's React re-renders) against CPU cost; idle-callback scheduling means we never block the main thread during a user interaction.

## Surface → handler routing

`processPage()` inspects `window.location.pathname` and dispatches to the matching surface logic. Every surface shares the same contract: find the media-anchor element, ensure the button isn't already present (check for `CLASS_CUSTOM_BUTTON`), call `addCustomBtn(anchor, iconColor)`.

| Surface               | URL pattern                          | Anchor selector                              | Click handler                       |
| --------------------- | ------------------------------------ | -------------------------------------------- | ----------------------------------- |
| Home / feed           | `/`, `/<user>/feed`                  | `<article>` + Like SVG                       | `handlers/post.ts` `postOnClicked`  |
| Post detail           | `/p/<id>/`, `/<user>/p/<id>/`        | `article` inside `[role="dialog"]` or `section main` | `handlers/post-detail.ts` |
| Reels feed            | `/reels/`                            | `section>main>div>div(>div)*` + Like SVG     | `handlers/reels.ts` `reelsOnClicked`|
| Reel detail           | `/reel/`                             | Comment SVG (`<path d="M20.656 17.008…">`)   | `handlers/reels.ts`                 |
| Stories               | `/stories/<user>/`                   | `section svg circle` (story menu)            | `handlers/stories.ts`               |
| Highlights            | `/stories/highlights/<id>/`          | same as stories                              | `handlers/highlights.ts`            |
| Profile avatar        | `/<user>/`                           | `section>main>div>header>section:nth-child(2) svg circle` | `handlers/profile.ts`   |
| Profile video tile    | `/<user>/`, `/<user>/reels`, `/<user>/tagged` | grid tile with `VIDEO_SVG_PATH` child      | `handlers/profile-reel.ts`          |
| Threads feed / detail | `www.threads.com/*`                  | (see `src/content/threads/`)                 | `content/threads/index.ts`          |

## Why SVG-path selectors

Instagram ships many class-name hashes (`xyz_abc`) and renames them on every deploy. The reference extension discovered that the Like heart, the Comment bubble, the Tag person glyph, and the video-cover triangle are all **stable SVG `<path d="...">` values** — Instagram reuses the same glyphs across surfaces, and the path strings rarely change.

So `src/content/index.ts` matches on `likeIconSelector`, `tagIconSelector`, `VIDEO_SVG_PATH`, etc., then walks up N levels of `parentElement` to find the button container. Parent-chain depth is brittle but stable within a release — the docs call this out when a handler breaks.

## Idempotency

Every injection is guarded by a class check:

```ts
if (likeBtn && articleList[i].getElementsByClassName(CLASS_CUSTOM_BUTTON).length === 0) {
  addCustomBtn(...);
}
```

That's the only mechanism preventing duplicate buttons as `processPage()` runs every 3 s — if the class is already present, we skip. The polling loop therefore converges on "one button per surface".

## Click dispatch

`handleGlobalClick` (in `src/content/index.ts`) is the sole delegator. It:

1. Finds the closest `.igdl-btn` ancestor.
2. Preventing-defaults the click.
3. Routes video-cover buttons to `handleVideoCoverDownloadBtn` directly.
4. Otherwise calls `onClickHandler(btn)` from `button.ts`, which looks at the button's class:
   - `.zip-btn` → `zipOnClicked` (carousel zip).
   - `.download-btn` → surface-specific handler based on the button's surrounding DOM.
   - `.open-tab-btn` → opens the post URL in a new tab (profile avatar flow).

The right-click (`contextmenu`) handler wires **Save As** into the same pipeline by passing `saveAs: true` through to `handlers/post.ts`.

## Threads

Threads has a separate orchestrator (`src/content/threads/index.ts`) because threads.com has a different DOM and different media URLs. The content script forwards `window.location.origin === "https://www.threads.com"` straight to `handleThreads()` and returns early — no shared code paths with the Instagram branches.

For context on how Threads-posted media reaches the extension, see [`architecture.md`](./architecture.md) § "Threads bridge".

## Related docs

- [`architecture.md`](./architecture.md) — module boundaries, where polling fits in the runtime.
- [`download-flow.md`](./download-flow.md) — what happens after a surface handler extracts the `MediaResource[]`.
- [`xhr-interception.md`](./xhr-interception.md) — how media URLs get into the cache in the first place.
- Reference extension: [TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension) — origin of the SVG-selector strategy.
