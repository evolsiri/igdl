import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { isBlobUrl, resolveBlobUrlToDataUrl } from "../extractors/blob";
import { getMediaName } from "../extractors/filename";
import { getUrlFromInfoApi, openInNewTab } from "../extractors/fn";
import { getParentSectionNode } from "../extractors/dom";
import { storageCache } from "../extractors/storage";

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

    if (pathnameArr.length === 2) {
      let mediaIndex = 0;
      const steps =
        target.parentElement?.firstElementChild?.querySelectorAll(":scope>div") ?? [];
      if (steps.length > 1) {
        steps.forEach((item, index) => {
          if (item.childNodes.length === 1) mediaIndex = index;
        });
      }

      const userId = storageCache.storiesUserIds.get(posterName);
      if (typeof userId === "string") {
        const item = storiesMap.get(userId) as StoriesReelsMedum | undefined;
        if (item && steps.length === item.items.length) {
          const handled = await handleMedia(item, mediaIndex);
          if (handled) return;
        }
      }
    } else {
      const mediaId = pathnameArr.at(-1)!;
      for (const item of Array.from(storiesMap.values()) as StoriesReelsMedum[]) {
        for (let i = 0; i < item.items.length; i++) {
          if (item.items[i].pk === mediaId) {
            const handled = await handleMedia(item, i);
            if (handled) return;
          }
        }
      }
    }

    // DOM fallback
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
    if (!sectionNode) return;
    const url = await storyGetUrl(target, sectionNode);
    if (!url) return;
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
