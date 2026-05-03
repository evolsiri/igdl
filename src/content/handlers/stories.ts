import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
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

async function storyGetUrl(target: HTMLElement, sectionNode: Element): Promise<string | null> {
  const res = await getUrlFromInfoApi(target);
  let url = (res?.url as string | undefined) ?? null;
  if (!url) {
    const videoSource = sectionNode.querySelector<HTMLSourceElement>("video > source");
    if (videoSource) {
      url = videoSource.getAttribute("src");
    } else if (sectionNode.querySelector('img[decoding="sync"]')) {
      const img = sectionNode.querySelector<HTMLImageElement>('img[decoding="sync"]')!;
      url = img.srcset.split(/ \d+w/g)[0].trim();
      if (!url || url.length === 0) url = img.getAttribute("src");
    } else if (sectionNode.querySelector("video")) {
      const vid = sectionNode.querySelector<HTMLVideoElement>("video")!;
      url = vid.src.length > 0 ? vid.src : vid.getAttribute("src");
    }
  }
  return url;
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
      await downloadViaFlow(
        {
          url,
          username: posterName,
          datetime: postTime ? dayjs(postTime) : undefined,
          id: getMediaName(url),
          type: "story",
        },
        saveAs,
      );
    } else {
      openInNewTab(url);
    }
  } catch (err) {
    console.warn("[igdl] storyOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "story download failed");
  }
}
