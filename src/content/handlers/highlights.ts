import dayjs from "dayjs";
import { CACHE_KEYS } from "../../services/media-cache/keys";
import type {
  HighlightMedia,
  HighlightReelEntry,
} from "../../types/media-cache";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { getMediaName } from "../extractors/filename";
import { openInNewTab } from "../extractors/fn";
import { storageCache } from "../extractors/storage";

interface SsrItem {
  taken_at: number;
  video_versions?: Array<{ url: string }>;
  image_versions2: { candidates: Array<{ url: string }> };
}

interface SsrNode {
  id: string;
  user: { username: string };
  items: SsrItem[];
}

function getSectionNode(target: HTMLAnchorElement): HTMLElement {
  let sectionNode: HTMLElement = target;
  while (sectionNode.tagName !== "SECTION" && sectionNode.parentElement) {
    sectionNode = sectionNode.parentElement;
  }
  return sectionNode;
}

function findReelsConnection(
  obj: Record<string, unknown>,
): { edges: Array<{ node: SsrNode }> } | undefined {
  for (const key in obj) {
    if (key === "xdt_api__v1__feed__reels_media__connection") {
      return obj[key] as { edges: Array<{ node: SsrNode }> };
    }
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      const result = findReelsConnection(value as Record<string, unknown>);
      if (result) return result;
    }
  }
  return undefined;
}

function stripHighlightPrefix(id: string): string {
  return id.startsWith("highlight:") ? id.slice("highlight:".length) : id;
}

interface VisibleMedia {
  url: string;
  isVideo: boolean;
}

/**
 * Returns the currently-visible video or image inside the highlight modal.
 * Adjacent reels are preloaded into the same `<section>` but positioned off
 * screen — we filter to the largest element whose horizontal center sits
 * within the section bounds. Returns null when the result is ambiguous so
 * the caller can fail loudly instead of grabbing the wrong reel's media.
 */
function findVisibleHighlightMedia(section: Element): VisibleMedia | null {
  const sectionRect = section.getBoundingClientRect();
  type Candidate = { url: string; isVideo: boolean; area: number };
  const candidates: Candidate[] = [];

  for (const video of Array.from(section.querySelectorAll<HTMLVideoElement>("video"))) {
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cx = rect.left + rect.width / 2;
    if (cx < sectionRect.left || cx > sectionRect.right) continue;
    const url = video.src.length > 0 ? video.src : video.getAttribute("src");
    if (url) candidates.push({ url, isVideo: true, area: rect.width * rect.height });
  }

  for (const img of Array.from(
    section.querySelectorAll<HTMLImageElement>('img[referrerpolicy="origin-when-cross-origin"]'),
  )) {
    if (img.classList.length <= 1) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cx = rect.left + rect.width / 2;
    if (cx < sectionRect.left || cx > sectionRect.right) continue;
    candidates.push({ url: img.src, isVideo: false, area: rect.width * rect.height });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area);
  return { url: candidates[0].url, isVideo: candidates[0].isVideo };
}

export async function highlightsOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const sectionNode = getSectionNode(target);
  const pathnameArr = window.location.pathname.split("/");
  const pk = pathnameArr[3];
  const { setting_format_use_indexing } = storageCache.settings;

  // Active carousel item: the dot indicator with exactly one child.
  let mediaIndex = 0;
  target.parentElement?.firstElementChild?.querySelectorAll(":scope>div").forEach((i, idx) => {
    if (i.childNodes.length === 1) mediaIndex = idx;
  });

  const downloadFromMetadata = async (
    item: { url: string; isVideo: boolean; takenAt: number; extension?: string },
    reel: { id: string; username: string; itemCount: number },
  ): Promise<void> => {
    if (target.className.includes("download-btn") || saveAs) {
      await downloadViaFlow(
        {
          url: item.url,
          username: reel.username,
          datetime: item.takenAt > 0 ? dayjs.unix(item.takenAt) : undefined,
          id: reel.id,
          index: setting_format_use_indexing && reel.itemCount > 1 ? mediaIndex + 1 : undefined,
          type: "highlight",
        },
        saveAs,
      );
    } else {
      openInNewTab(item.url);
    }
  };

  const downloadFromBareUrl = async (url: string): Promise<void> => {
    if (target.className.includes("download-btn") || saveAs) {
      let posterName = "highlights";
      for (const item of Array.from(sectionNode.querySelectorAll("a[role=link]"))) {
        const hrefArr = item
          .getAttribute("href")
          ?.split("/")
          .filter((s) => s);
        if (hrefArr?.length === 1) {
          posterName = hrefArr[0];
          break;
        }
      }
      const postTime = Array.from(sectionNode.querySelectorAll("time"))
        .find((i) => i.classList.length !== 0)
        ?.getAttribute("datetime");
      await downloadViaFlow(
        {
          url,
          username: posterName,
          datetime: postTime ? dayjs(postTime) : undefined,
          id: getMediaName(url),
          type: "highlight",
        },
        saveAs,
      );
    } else {
      openInNewTab(url);
    }
  };

  try {
    // Tier A — XHR cache. Populated by MediaCacheService.ingestXhrSnapshot
    // from intercepted `/graphql/query` responses. Source of truth when
    // present.
    if (typeof pk === "string" && pk.length > 0) {
      const stored = (await chrome.storage.local.get([CACHE_KEYS.highlightMedia])) as {
        [k: string]: HighlightMedia | undefined;
      };
      const cache = stored[CACHE_KEYS.highlightMedia];
      const reel: HighlightReelEntry | undefined = cache?.[pk];
      const item = reel?.items[mediaIndex];
      if (reel && item) {
        await downloadFromMetadata(
          { url: item.url, isVideo: item.isVideo, takenAt: item.takenAt, extension: item.extension },
          { id: reel.id, username: reel.username, itemCount: reel.items.length },
        );
        return;
      }
    }

    // Tier B — script-tag SSR data. Stale across SPA navigation, so only
    // trust it when an edge with a matching pk is found. Tolerant of
    // `node.id` shape drift (with or without the `"highlight:"` prefix).
    for (const script of Array.from(window.document.scripts)) {
      const innerHTML = script.innerHTML;
      if (!innerHTML.includes("xdt_api__v1__feed__reels_media__connection")) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(innerHTML);
      } catch {
        continue;
      }
      if (typeof parsed !== "object" || parsed === null) continue;
      const res = findReelsConnection(parsed as Record<string, unknown>);
      if (!res) continue;
      const matchingEdge = res.edges.find(
        (e) => stripHighlightPrefix(e.node.id) === pk,
      );
      if (matchingEdge) {
        const node = matchingEdge.node;
        const media = node.items[mediaIndex];
        if (!media) {
          reportFailure("highlight: media index out of range");
          return;
        }
        const url =
          media.video_versions?.[0]?.url ?? media.image_versions2?.candidates?.[0]?.url;
        if (!url) {
          reportFailure("highlight: cannot extract media URL");
          return;
        }
        await downloadFromMetadata(
          {
            url,
            isVideo: !!media.video_versions?.[0]?.url,
            takenAt: media.taken_at,
          },
          { id: node.id, username: node.user.username, itemCount: node.items.length },
        );
        return;
      }
      // Connection found but no matching edge — script tag is stale. Stop
      // scanning rather than risk falling through to ambiguous DOM scrape.
      reportFailure("highlight: no cached data for active reel — try again");
      return;
    }

    // Tier C — DOM fallback. Restricted to the visible carousel slide so we
    // don't accidentally pick up a preloaded sibling reel's media.
    const visible = findVisibleHighlightMedia(sectionNode);
    if (visible) {
      await downloadFromBareUrl(visible.url);
      return;
    }

    reportFailure("highlight: could not locate active media");
  } catch (err) {
    console.warn("[igdl] highlightsOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "highlight download failed");
  }
}
