import dayjs from "dayjs";
import { downloadViaFlow, reportFailure, reportLoading } from "../downloadBridge";
import { isBlobUrl, resolveBlobUrlToDataUrl } from "../extractors/blob";
import { getMediaName } from "../extractors/filename";
import { getUrlFromInfoApi, openInNewTab } from "../extractors/fn";
import { getParentSectionNode } from "../extractors/dom";
import { storageCache } from "../extractors/storage";

/**
 * How long to wait for Instagram's XHR to populate the storage cache after
 * a SPA navigation when both Tier A and Tier B miss synchronously. Tuned by
 * observation: Instagram's reels-media GraphQL fetch typically returns in
 * 200-600ms after navigation, so 2s gives a comfortable margin without
 * making the user feel stuck. Mutable via `__setTierATimingsForTesting` so
 * unit tests don't have to wait 2s for the polling fall-through.
 */
let tierAWaitMs = 2000;
let tierAPollMs = 200;

/**
 * Test-only: override Tier A polling timings so tests don't have to wait
 * the full retry window. Production code never calls this.
 *
 * @example
 * beforeEach(() => __setTierATimingsForTesting(0, 0));
 */
export function __setTierATimingsForTesting(waitMs: number, pollMs: number): void {
  tierAWaitMs = waitMs;
  tierAPollMs = pollMs;
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
  const dataUrl = await resolveBlobUrlToDataUrl(url);
  if (!dataUrl) {
    reportFailure("story: cannot read MSE video stream — try refreshing");
    return null;
  }
  return dataUrl;
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

/**
 * Polls a synchronous predicate at `intervalMs` cadence for up to
 * `maxWaitMs`, returning the first non-null result. Used to recover from
 * the race where a user clicks the download button before Instagram's XHR
 * populates the storage cache (SPA navigation between stories doesn't
 * embed an SSR script tag, so Tier B can't catch this case).
 */
async function pollForReelMatch(
  predicate: () => ReelMatch | null,
  maxWaitMs: number,
  intervalMs: number,
): Promise<ReelMatch | null> {
  const deadline = Date.now() + maxWaitMs;
  let result = predicate();
  if (result) return result;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    result = predicate();
    if (result) return result;
  }
  return null;
}

export async function storyOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const pathnameArr = window.location.pathname.split("/").filter((e) => e);
  const posterName = pathnameArr[1];
  const { setting_format_use_indexing } = storageCache.settings;

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
    if (target.className.includes("download-btn") || saveAs) {
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

  try {
    const storiesMap = storageCache.storiesReelsMedia as Map<string, StoriesReelsMedum>;

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

    // Tier A — XHR-intercepted GraphQL data. Populated by `src/inject.ts` /
    // `src/xhr.ts` when the user navigates through the feed/profile.
    const tierAResult = tryTierAReelMatch(
      storiesMap,
      posterName,
      mediaIdFromUrl,
      activeMediaIndex,
      stepCount,
    );
    if (tierAResult) {
      const handled = await handleMedia(tierAResult.reel, tierAResult.mediaIndex);
      if (handled) return;
    }

    // Tier B — inline-JSON SSR data. Available even when the XHR cache is
    // empty (direct navigation to a story URL skips the feed pre-load).
    // Returns HTTPS CDN URLs, so a hit here bypasses the unfetchable-MSE-
    // blob trap that Tier C would otherwise expose users to.
    const ssrMatch = getReelMediumFromScriptTags(
      posterName,
      mediaIdFromUrl,
      activeMediaIndex,
      stepCount,
    );
    if (ssrMatch) {
      const handled = await handleMedia(ssrMatch.reel, ssrMatch.mediaIndex);
      if (handled) return;
    }

    // Tier A retry — recovers from the SPA-navigation race. Instagram's
    // XHR populates `storiesReelsMedia` async; on a fresh story navigation
    // the user can click the download button before that XHR returns.
    // Tier B can't catch this case because SPA navigations don't embed a
    // new SSR script tag. Show a loading toast so the user sees that we're
    // working on it, poll until cache populates or the deadline elapses.
    if (target.className.includes("download-btn") || saveAs) {
      const dismissLoading = reportLoading("Loading story…");
      let racedResult: ReelMatch | null = null;
      try {
        racedResult = await pollForReelMatch(
          () =>
            tryTierAReelMatch(
              storageCache.storiesReelsMedia as Map<string, StoriesReelsMedum>,
              posterName,
              mediaIdFromUrl,
              activeMediaIndex,
              stepCount,
            ),
          tierAWaitMs,
          tierAPollMs,
        );
      } finally {
        dismissLoading();
      }
      if (racedResult) {
        const handled = await handleMedia(racedResult.reel, racedResult.mediaIndex);
        if (handled) return;
      }
    }

    // Tier C — DOM fallback. Only reachable when Tiers A (sync + retry) and
    // B miss; may return a `blob:` URL for MSE-played videos. The conversion
    // attempt (`convertBlobUrlForDownload`) succeeds when the blob is a
    // real Blob and fails when it's a `MediaSource` reference — Tier B is
    // designed to catch the MSE case before we get here.
    let sectionNode: Element | null = getParentSectionNode(target);
    if (!sectionNode) {
      // Feed story: <section> is a descendant, not an ancestor of the button.
      // Walk up until we reach an ancestor that contains story media.
      let el: Element | null = target.parentElement;
      while (el && el !== document.body) {
        if (el.querySelector("video") || el.querySelector('img[decoding="sync"]')) {
          sectionNode = el;
          break;
        }
        el = el.parentElement;
      }
    }
    if (!sectionNode) {
      reportFailure("story: page not fully loaded — try clicking again");
      return;
    }
    const url = await storyGetUrl(target, sectionNode);
    if (!url) {
      reportFailure("story: cannot extract media URL — try refreshing");
      return;
    }
    const postTime = sectionNode.querySelector("time")?.getAttribute("datetime");
    if (target.className.includes("download-btn") || saveAs) {
      const downloadUrl = await convertBlobUrlForDownload(url);
      if (!downloadUrl) return; // failure already toasted
      await downloadViaFlow(
        {
          // Send the SW-safe URL (HTTPS or `data:`); the original `url`
          // (possibly `blob:`) feeds `getMediaName` so the filename id is
          // a stable UUID rather than a base64 chunk.
          url: downloadUrl,
          username: posterName,
          datetime: postTime ? dayjs(postTime) : undefined,
          id: getMediaName(url),
          type: "story",
        },
        saveAs,
      );
    } else {
      // open-in-new-tab path: pass the original URL — `window.open(blob:)` is
      // allowed because the content script is same-origin to the page that
      // minted the blob; converting to a data URL would make the URL bar
      // show base64 and break Firefox top-level navigation to data:.
      openInNewTab(url);
    }
  } catch (err) {
    console.warn("[igdl] storyOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "story download failed");
  }
}
