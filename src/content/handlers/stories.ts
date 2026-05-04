import dayjs from "dayjs";
import { downloadViaFlow, reportFailure, reportLoading } from "../downloadBridge";
import { isBlobUrl, resolveBlobUrlToDataUrl } from "../extractors/blob";
import { getMediaName } from "../extractors/filename";
import { getUrlFromInfoApi, openInNewTab } from "../extractors/fn";
import { getParentSectionNode } from "../extractors/dom";
import { storageCache } from "../extractors/storage";

/**
 * Retry configuration for the outer download attempt loop. Each attempt runs
 * the full Tier A→B→C sequence; if all tiers miss, we pause `retryDelayMs`
 * before the next attempt. Instagram's XHR cache typically populates within
 * 200-600ms; three attempts at 1.5s spacing give a 4.5s window before we
 * give up and show a failure toast.
 *
 * Mutable via `__setRetryTimingsForTesting` so unit tests finish quickly.
 */
let retryAttempts = 3;
let retryDelayMs = 1500;

/**
 * Test-only: override retry timings so tests don't have to wait the full
 * retry window. Production code never calls this.
 *
 * @example
 * beforeEach(() => __setRetryTimingsForTesting(1, 0));
 */
export function __setRetryTimingsForTesting(attempts: number, delayMs: number): void {
  retryAttempts = attempts;
  retryDelayMs = delayMs;
}

/** @deprecated Use __setRetryTimingsForTesting instead */
export function __setTierATimingsForTesting(waitMs: number, pollMs: number): void {
  retryDelayMs = waitMs;
  void pollMs;
}

interface StoryItem {
  pk: string;
  expiring_at: number;
  taken_at: number;
  image_versions2: { candidates: Array<{ url: string }> };
  video_versions?: Array<{ url: string }>;
}

interface StoriesReelsMedum {
  id: string;
  user: { username: string };
  items: StoryItem[];
}

/**
 * Returns the best-available URL for the active story media. Prefers the info
 * API (HTTPS CDN), the declarative `<video><source src>` (HTTPS — never set by
 * MSE), and the `<img>` srcset (HTTPS) over the imperative `<video>.src`
 * (which on MSE/HLS streams is a `blob:` URL).
 *
 * The returned URL may be a `blob:` URL — the download path converts via
 * `convertBlobUrlForDownload` before crossing the SW boundary, while the
 * open-in-new-tab path passes the blob URL straight to `window.open` (allowed
 * — the content script is same-origin to the page that minted the blob).
 */
async function storyGetUrl(target: HTMLElement, sectionNode: Element): Promise<string | null> {
  const res = await getUrlFromInfoApi(target);
  const apiUrl = (res?.url as string | undefined) ?? null;
  if (apiUrl) return apiUrl;

  const videoSource = sectionNode.querySelector<HTMLSourceElement>("video > source");
  if (videoSource) {
    const src = videoSource.getAttribute("src");
    if (src && !isBlobUrl(src)) return src;
  }

  const syncImg = sectionNode.querySelector<HTMLImageElement>('img[decoding="sync"]');
  if (syncImg) {
    const fromSrcset = syncImg.srcset.split(/ \d+w/g)[0]?.trim();
    if (fromSrcset && !isBlobUrl(fromSrcset)) return fromSrcset;
    const fromSrc = syncImg.getAttribute("src");
    if (fromSrc && !isBlobUrl(fromSrc)) return fromSrc;
  }

  const vid = sectionNode.querySelector<HTMLVideoElement>("video");
  if (vid) return vid.src.length > 0 ? vid.src : vid.getAttribute("src");

  return null;
}

/**
 * Converts a `blob:` URL to a `data:` URL so it can cross the SW boundary.
 * Reports a user-facing failure and returns `null` on conversion error so the
 * caller can short-circuit. HTTPS / data URLs pass through unchanged.
 *
 * Only used on the download path — the open-in-new-tab path passes the blob
 * URL straight to `window.open`, which works because the content script is
 * same-origin to the page document that minted the blob.
 *
 * **Limitation.** When `<video>.src` is set from a `MediaSource` (Instagram's
 * MSE/HLS player), the blob URL references the MediaSource — not a real Blob —
 * and `fetch()` cannot dereference it. The caller should reach Tier B (inline
 * JSON SSR) before falling through to the DOM tier so this conversion is
 * rarely the only option.
 */
async function convertBlobUrlForDownload(url: string): Promise<string | null> {
  if (!isBlobUrl(url)) return url;
  return resolveBlobUrlToDataUrl(url);
}

/**
 * Walks an arbitrary parsed JSON object looking for the
 * `xdt_api__v1__feed__reels_media` key Instagram embeds in inline `<script>`
 * tags on story pages. Direct navigation to a story URL bypasses the
 * feed-level XHR that populates Tier A, but the SSR JSON is always present
 * — that's how the page boots without a network round-trip.
 */
function findReelsMediaInJson(
  obj: Record<string, unknown>,
): { reels_media: StoriesReelsMedum[] } | undefined {
  for (const key in obj) {
    if (key === "xdt_api__v1__feed__reels_media") {
      const value = obj[key];
      if (
        typeof value === "object" &&
        value !== null &&
        Array.isArray((value as { reels_media?: unknown }).reels_media)
      ) {
        return value as { reels_media: StoriesReelsMedum[] };
      }
    }
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      const result = findReelsMediaInJson(value as Record<string, unknown>);
      if (result) return result;
    }
  }
  return undefined;
}

interface ReelMatch {
  reel: StoriesReelsMedum;
  mediaIndex: number;
}

/**
 * Tier A story-URL resolution: synchronous lookup against the XHR-populated
 * storage cache (`storageCache.storiesReelsMedia`).
 *
 * For 3-part URLs `/stories/<user>/<id>/`, scans every cached reel for an
 * item whose `pk` matches the URL id. For 2-part URLs `/stories/<user>/`,
 * looks up the cached user-id by `posterName`, then enforces a dot-count
 * safety check to reject stale cache entries (different number of items
 * than the active carousel).
 */
function tryTierAReelMatch(
  storiesMap: Map<string, StoriesReelsMedum>,
  posterName: string,
  mediaId: string | undefined,
  fallbackIndex: number,
  expectedItemCount: number,
): ReelMatch | null {
  if (mediaId !== undefined) {
    for (const item of Array.from(storiesMap.values())) {
      const idx = item.items.findIndex((i) => i.pk === mediaId);
      if (idx >= 0) return { reel: item, mediaIndex: idx };
    }
    return null;
  }
  const userId = storageCache.storiesUserIds.get(posterName);
  if (typeof userId !== "string") return null;
  const item = storiesMap.get(userId);
  if (!item) return null;
  if (expectedItemCount > 0 && expectedItemCount !== item.items.length) return null;
  return { reel: item, mediaIndex: fallbackIndex };
}

/**
 * Tier B story-URL resolution: scans inline `<script>` tags for
 * `xdt_api__v1__feed__reels_media` SSR data and returns the matching reel +
 * media index for the active story. Sits between Tier A (XHR cache) and
 * Tier C (DOM fallback) so that direct-navigation cases still resolve to an
 * HTTPS CDN URL — Tier C's MSE blob is unfetchable, and the cleanest defense
 * is to never reach it when SSR data is available.
 *
 * For 3-part URLs `/stories/<user>/<id>/`, matches by `item.pk === id`. For
 * 2-part URLs `/stories/<user>/`, matches by `reel.user.username === poster`
 * with a count-vs-DOM safety check (`expectedItemCount`) to reject stale SSR.
 */
function getReelMediumFromScriptTags(
  posterName: string,
  mediaId: string | undefined,
  fallbackIndex: number,
  expectedItemCount: number,
): ReelMatch | null {
  for (const script of Array.from(window.document.scripts)) {
    const innerHTML = script.innerHTML;
    if (!innerHTML.includes("xdt_api__v1__feed__reels_media")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(innerHTML);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const res = findReelsMediaInJson(parsed as Record<string, unknown>);
    if (!res?.reels_media) continue;

    for (const reel of res.reels_media) {
      if (mediaId !== undefined) {
        const idx = reel.items.findIndex((i) => i.pk === mediaId);
        if (idx >= 0) return { reel, mediaIndex: idx };
      } else if (reel.user.username === posterName) {
        // Reject stale SSR: dot count must match item count for 2-part URLs.
        if (expectedItemCount > 0 && reel.items.length !== expectedItemCount) continue;
        return { reel, mediaIndex: fallbackIndex };
      }
    }
  }
  return null;
}


export async function storyOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const pathnameArr = window.location.pathname.split("/").filter((e) => e);
  const posterName = pathnameArr[1];
  const { setting_format_use_indexing } = storageCache.settings;
  const isDownload = target.className.includes("download-btn") || saveAs;

  const handleMedia = async (
    item: StoriesReelsMedum,
    mediaIndex: number,
  ): Promise<boolean> => {
    const media = item.items[mediaIndex];
    if (!media) return false;
    if (dayjs.unix(media.expiring_at).isBefore(dayjs())) return false;
    const url =
      media.video_versions?.[0]?.url ?? media.image_versions2?.candidates[0]?.url;
    if (!url) return false;
    if (isDownload) {
      await downloadViaFlow(
        {
          url,
          username: item.user.username,
          datetime: dayjs.unix(media.taken_at),
          id: item.id,
          index: setting_format_use_indexing ? mediaIndex + 1 : undefined,
          type: "story",
        },
        saveAs,
      );
    } else {
      openInNewTab(url);
    }
    return true;
  };

  // Compute the active media index once — used by Tier A and Tier B for
  // 2-part URLs.
  let activeMediaIndex = 0;
  let stepCount = 0;
  if (pathnameArr.length === 2) {
    const steps =
      target.parentElement?.firstElementChild?.querySelectorAll(":scope>div") ?? [];
    stepCount = steps.length;
    if (stepCount > 1) {
      steps.forEach((item, index) => {
        if (item.childNodes.length === 1) activeMediaIndex = index;
      });
    }
  }
  const mediaIdFromUrl = pathnameArr.length === 3 ? pathnameArr.at(-1) : undefined;

  // open-in-new-tab: try Tier A → B once, then fall through to DOM. No retry
  // loop — the new-tab path doesn't need the loading toast and blob: URLs are
  // safe to pass to window.open (same-origin content script).
  if (!isDownload) {
    try {
      const storiesMap = storageCache.storiesReelsMedia as Map<string, StoriesReelsMedum>;
      const tierAResult = tryTierAReelMatch(storiesMap, posterName, mediaIdFromUrl, activeMediaIndex, stepCount);
      if (tierAResult) {
        const handled = await handleMedia(tierAResult.reel, tierAResult.mediaIndex);
        if (handled) return;
      }
      const ssrMatch = getReelMediumFromScriptTags(posterName, mediaIdFromUrl, activeMediaIndex, stepCount);
      if (ssrMatch) {
        const handled = await handleMedia(ssrMatch.reel, ssrMatch.mediaIndex);
        if (handled) return;
      }
      let sectionNode: Element | null = getParentSectionNode(target);
      if (!sectionNode) {
        let el: Element | null = target.parentElement;
        while (el && el !== document.body) {
          if (el.querySelector("video") || el.querySelector('img[decoding="sync"]')) {
            sectionNode = el;
            break;
          }
          el = el.parentElement;
        }
      }
      if (sectionNode) {
        const url = await storyGetUrl(target, sectionNode);
        if (url) { openInNewTab(url); return; }
      }
    } catch (err) {
      console.warn("[igdl] storyOnClicked (new tab)", err);
    }
    return;
  }

  // Download path: show a persistent "Downloading…" toast immediately and
  // retry the full Tier A→B→C sequence up to `retryAttempts` times. Each
  // attempt waits `retryDelayMs` before the next try. The loading toast stays
  // visible throughout so the user knows we're still working on it.
  const dismissLoading = reportLoading("Downloading…");
  try {
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }

      // Tier A — XHR-intercepted GraphQL data.
      const storiesMap = storageCache.storiesReelsMedia as Map<string, StoriesReelsMedum>;
      const tierAResult = tryTierAReelMatch(storiesMap, posterName, mediaIdFromUrl, activeMediaIndex, stepCount);
      if (tierAResult) {
        const handled = await handleMedia(tierAResult.reel, tierAResult.mediaIndex);
        if (handled) return;
      }

      // Tier B — inline-JSON SSR data. Reliable on direct navigations; missed
      // on SPA navigations (no new script tag is embedded).
      const ssrMatch = getReelMediumFromScriptTags(posterName, mediaIdFromUrl, activeMediaIndex, stepCount);
      if (ssrMatch) {
        const handled = await handleMedia(ssrMatch.reel, ssrMatch.mediaIndex);
        if (handled) return;
      }

      // Tier C — DOM fallback. Only reachable when A and B miss. May yield a
      // blob: URL for MSE-played videos; convertBlobUrlForDownload converts
      // real Blobs and returns null for MediaSource-backed blobs.
      let sectionNode: Element | null = getParentSectionNode(target);
      if (!sectionNode) {
        let el: Element | null = target.parentElement;
        while (el && el !== document.body) {
          if (el.querySelector("video") || el.querySelector('img[decoding="sync"]')) {
            sectionNode = el;
            break;
          }
          el = el.parentElement;
        }
      }
      if (!sectionNode) continue; // page not ready yet — retry

      const url = await storyGetUrl(target, sectionNode);
      if (!url) continue; // no media found yet — retry

      const postTime = sectionNode.querySelector("time")?.getAttribute("datetime");
      const downloadUrl = await convertBlobUrlForDownload(url);
      if (!downloadUrl) continue; // MSE blob unfetchable (MediaSource-backed) — retry

      await downloadViaFlow(
        {
          url: downloadUrl,
          username: posterName,
          datetime: postTime ? dayjs(postTime) : undefined,
          id: getMediaName(url),
          type: "story",
        },
        saveAs,
      );
      return; // success — loading toast dismissed in finally
    }

    // All attempts exhausted.
    reportFailure("story: media not ready — try again in a moment");
  } catch (err) {
    console.warn("[igdl] storyOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "story download failed");
  } finally {
    dismissLoading();
  }
}
