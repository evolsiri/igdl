import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { getMediaName } from "../extractors/filename";
import { openInNewTab } from "../extractors/fn";
import { storageCache } from "../extractors/storage";

interface HighlightItem {
  taken_at: number;
  video_versions?: Array<{ url: string }>;
  image_versions2: { candidates: Array<{ url: string }> };
}

interface HighlightNode {
  id: string;
  user: { username: string };
  items: HighlightItem[];
}

function getSectionNode(target: HTMLAnchorElement): HTMLElement {
  let sectionNode: HTMLElement = target;
  while (sectionNode.tagName !== "SECTION" && sectionNode.parentElement) {
    sectionNode = sectionNode.parentElement;
  }
  return sectionNode;
}

function findHighlight(
  obj: Record<string, unknown>,
): { edges: Array<{ node: HighlightNode }> } | undefined {
  for (const key in obj) {
    if (key === "xdt_api__v1__feed__reels_media__connection") {
      return obj[key] as { edges: Array<{ node: HighlightNode }> };
    }
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      const result = findHighlight(value as Record<string, unknown>);
      if (result) return result;
    }
  }
  return undefined;
}

export async function highlightsOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const sectionNode = getSectionNode(target);
  const pathnameArr = window.location.pathname.split("/");
  const { setting_format_use_indexing } = storageCache.settings;

  const download = async (
    url: string,
    filenameObj?: Parameters<typeof downloadViaFlow>[0],
  ) => {
    if (target.className.includes("download-btn") || saveAs) {
      if (filenameObj) {
        await downloadViaFlow({ ...filenameObj, url, type: "highlight" }, saveAs);
      } else {
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
      }
    } else {
      openInNewTab(url);
    }
  };

  let mediaIndex = 0;
  target.parentElement?.firstElementChild?.querySelectorAll(":scope>div").forEach((i, idx) => {
    if (i.childNodes.length === 1) mediaIndex = idx;
  });

  try {
    const cache = (await chrome.storage.local.get(["highlights_data"])) as {
      highlights_data?: Array<[string, HighlightNode]>;
    };

    const handleNode = async (data: HighlightNode) => {
      const media = data.items[mediaIndex];
      const url = media.video_versions?.[0].url || media.image_versions2.candidates[0].url;
      await download(url, {
        url,
        username: data.user.username,
        datetime: dayjs.unix(media.taken_at),
        id: data.id,
        index: setting_format_use_indexing ? mediaIndex + 1 : undefined,
      });
    };

    const localData = new Map(cache.highlights_data || []).get(
      "highlight:" + pathnameArr[3],
    ) as HighlightNode | undefined;
    if (localData) {
      await handleNode(localData);
      return;
    }

    for (const script of Array.from(window.document.scripts)) {
      try {
        const innerHTML = script.innerHTML;
        const data = JSON.parse(innerHTML);
        if (innerHTML.includes("xdt_api__v1__feed__reels_media__connection")) {
          const res = findHighlight(data);
          if (res) {
            await handleNode(res.edges[0].node);
            return;
          }
        }
      } catch {
        /* skip malformed script */
      }
    }

    const videoUrl = sectionNode.querySelector("video")?.getAttribute("src");
    if (videoUrl) {
      await download(videoUrl);
      return;
    }

    for (const item of Array.from(
      sectionNode.querySelectorAll<HTMLImageElement>(
        'img[referrerpolicy="origin-when-cross-origin"]',
      ),
    )) {
      if (item.classList.length > 1) {
        await download(item.src);
        return;
      }
    }

    reportFailure("highlight download failed");
  } catch (err) {
    console.warn("[igdl] highlightsOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "highlight download failed");
  }
}
