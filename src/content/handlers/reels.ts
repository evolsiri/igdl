import dayjs from "dayjs";
import type { DashRendition } from "../../types/instagram";
import { downloadViaFlow, reportFailure, reportVp9Lookup } from "../downloadBridge";
import { resolveReelVp9 } from "../extractors/dash";
import { getMediaName } from "../extractors/filename";
import {
  fetchHtml,
  findPostId,
  getDataFromAPI,
  getUrlFromInfoApi,
  openInNewTab,
} from "../extractors/fn";
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
  video_dash_manifest?: string | null;
  user: { username: string };
  taken_at: number;
}

/** How long the optional manifest lookup may hold a download up before it proceeds in standard quality. */
const VP9_LOOKUP_TIMEOUT_MS = 4000;

/**
 * VP9 rendition for a reel taken from the reels-feed JSON. That JSON doesn't
 * always include the DASH manifest, so a reel without one is looked up through
 * the info API — extra requests that are only made while the VP9 setting is
 * on, with a loading toast up for as long as they take.
 *
 * The lookup names the reel by its own shortcode and checks the answer's
 * shortcode too. It must never go by the page URL: this runs after an
 * `await`, and the feed rewrites the URL as the user scrolls, which would
 * attach the next reel's video to this reel's download.
 */
async function findVp9(media: ReelsMedia): Promise<DashRendition | undefined> {
  if (!storageCache.canonical.preferVp9Reels || !media.video_versions?.length) return undefined;
  if (media.video_dash_manifest) return resolveReelVp9(media);
  if (!media.code) return undefined;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), VP9_LOOKUP_TIMEOUT_MS);
  });
  const dismiss = reportVp9Lookup();
  try {
    const item = await Promise.race([getDataFromAPI(null, media.code), timedOut]);
    if (item && item.code !== media.code) {
      console.warn("[igdl] VP9 lookup answered with another post; using the standard video");
    }
    return item?.code === media.code ? resolveReelVp9(item) : undefined;
  } finally {
    clearTimeout(timer);
    dismiss();
  }
}

export async function reelsOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const isDownload = target.className.includes("download-btn") || saveAs;
  const final = async (obj: Parameters<typeof downloadViaFlow>[0]) => {
    if (isDownload) {
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
      // "Open in new tab" plays the standard video, so skip the lookup for it.
      vp9: isDownload ? await findVp9(media) : undefined,
    });
  };

  // Which reel was clicked is read from the URL here, before anything is
  // awaited: the feed rewrites the URL as the user scrolls on.
  const code = window.location.pathname.split("/").at(-2);
  const clickedPostId = findPostId(null);
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

  if (!clickedPostId) return;
  try {
    const res = await getUrlFromInfoApi(null, 0, clickedPostId);
    if (!res) return;
    await final({
      url: res.url as string,
      username: res.owner as string,
      datetime: dayjs.unix(res.taken_at as number),
      id: getMediaName(res.url as string),
      vp9: resolveReelVp9(res),
    });
  } catch (err) {
    console.warn("[igdl] reelsOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "reel download failed");
  }
}
