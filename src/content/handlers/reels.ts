import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { getMediaName } from "../extractors/filename";
import { fetchHtml, getUrlFromInfoApi, openInNewTab } from "../extractors/fn";
import { storageCache } from "../extractors/storage";

function findReels(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const key in obj) {
    if (key === "xdt_api__v1__clips__home__connection_v2") {
      return obj[key] as Record<string, unknown>;
    }
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      const result = findReels(value as Record<string, unknown>);
      if (result) return result;
    }
  }
  return undefined;
}

interface ReelsMedia {
  code?: string;
  video_versions?: Array<{ url: string }>;
  image_versions2?: { candidates: Array<{ url: string }> };
  user: { username: string };
  taken_at: number;
}

export async function reelsOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const final = async (obj: Parameters<typeof downloadViaFlow>[0]) => {
    if (target.className.includes("download-btn") || saveAs) {
      await downloadViaFlow({ ...obj, type: "reel" }, saveAs);
    } else {
      openInNewTab(obj.url);
    }
  };

  const handleMedia = async (media: ReelsMedia) => {
    const url = media.video_versions?.[0].url || media.image_versions2!.candidates[0].url;
    await final({
      url,
      username: media.user.username,
      datetime: dayjs.unix(media.taken_at),
      id: getMediaName(url),
    });
  };

  const code = window.location.pathname.split("/").at(-2);
  const media = storageCache.reelsEdgesData.get(code ?? "") as ReelsMedia | undefined;
  if (media) {
    await handleMedia(media);
    return;
  }

  const scripts = await fetchHtml();
  for (const script of [...window.document.scripts, ...Array.from(scripts)]) {
    try {
      const innerHTML = script.innerHTML;
      const data = JSON.parse(innerHTML);
      if (innerHTML.includes("xdt_api__v1__clips__home__connection_v2")) {
        const res = findReels(data);
        const edges = (res as { edges?: Array<{ node: { media: ReelsMedia } }> } | undefined)
          ?.edges;
        if (edges) {
          for (const item of edges) {
            if (item.node.media.code === code) {
              await handleMedia(item.node.media);
              return;
            }
          }
        }
      }
    } catch {
      /* skip malformed script */
    }
  }

  const wrapperNode = target.parentNode!.parentNode as HTMLElement;
  try {
    const res = await getUrlFromInfoApi(wrapperNode);
    if (!res) return;
    await final({
      url: res.url as string,
      username: res.owner as string,
      datetime: dayjs.unix(res.taken_at as number),
      id: getMediaName(res.url as string),
    });
  } catch (err) {
    console.warn("[igdl] reelsOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "reel download failed");
  }
}
