import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { getParentArticleNode } from "../extractors/dom";
import { getMediaName } from "../extractors/filename";
import { checkType, getUrlFromInfoApi, openInNewTab } from "../extractors/fn";
import { storageCache } from "../extractors/storage";

/**
 * Post handler ported from the reference extension. Walks from the clicked
 * button to the enclosing `<article>`, resolves media URL(s) via the info API
 * (with DOM fallbacks), and routes the download through our bridge.
 */

async function fetchVideoURL(
  articleNode: HTMLElement,
  videoElem: HTMLVideoElement,
): Promise<string> {
  const poster = videoElem.getAttribute("poster");
  const timeNodes = articleNode.querySelectorAll("time");
  const posterUrl = (timeNodes[timeNodes.length - 1].parentNode!.parentNode as HTMLAnchorElement)
    .href;
  const posterPattern = /\/([^/?]*)\?/;
  const posterMatch = poster?.match(posterPattern);
  const postFileName = posterMatch?.[1];
  const resp = await fetch(posterUrl);
  const content = await resp.text();
  const pattern = new RegExp(`${postFileName}.*?video_versions.*?url":("[^"]*")`, "s");
  const match = content.match(pattern);
  let videoUrl = JSON.parse(match?.[1] ?? "");
  videoUrl = videoUrl.replace(
    /^(?:https?:\/\/)?(?:[^@/\n]+@)?(?:www\.)?([^:/?\n]+)/g,
    "https://scontent.cdninstagram.com",
  );
  videoElem.setAttribute("videoURL", videoUrl);
  return videoUrl;
}

async function getVideoSrc(
  articleNode: HTMLElement,
  videoElem: HTMLVideoElement,
): Promise<string | null> {
  let url = videoElem.getAttribute("src");
  if (videoElem.hasAttribute("videoURL")) {
    url = videoElem.getAttribute("videoURL");
  } else if (url === null || url.includes("blob")) {
    url = await fetchVideoURL(articleNode, videoElem);
  }
  return url;
}

interface PostUrlResult {
  url: string | null | undefined;
  res?: Record<string, unknown> | null;
  mediaIndex?: number;
}

async function postGetUrl(articleNode: HTMLElement): Promise<PostUrlResult | null> {
  let url: string | null | undefined;
  let res: Record<string, unknown> | null | undefined;
  let mediaIndex = -1;

  if (articleNode.querySelectorAll("li[style][class]").length === 0) {
    res = await getUrlFromInfoApi(articleNode);
    url = res?.url as string | undefined;
    if (!url) {
      const videoElem = articleNode.querySelector<HTMLVideoElement>("article div > video");
      const imgElem = articleNode.querySelector<HTMLImageElement>("article div[role] div > img");
      if (videoElem) {
        url = await getVideoSrc(articleNode, videoElem);
      } else if (imgElem) {
        url = imgElem.getAttribute("src");
      }
    }
  } else {
    const isPostView = window.location.pathname.startsWith("/p/");
    const idxFromUrl = new URLSearchParams(window.location.search).get("img_index");
    if (idxFromUrl) {
      mediaIndex = +idxFromUrl - 1;
    } else {
      let dotsList: Element[];
      if (isPostView) {
        dotsList = Array.from(
          articleNode.querySelectorAll(
            ":scope>div>div:nth-child(1)>div>div>div:nth-child(2)>div",
          ),
        );
      } else if (checkType() === "pc") {
        const parent = articleNode.querySelector("ul")?.parentElement?.parentElement
          ?.parentElement?.parentElement?.parentElement;
        dotsList = parent?.nextElementSibling
          ? (Array.from(parent.nextElementSibling.childNodes).filter(
              (n) => n instanceof Element,
            ) as Element[])
          : [];
      } else {
        dotsList = Array.from(
          articleNode.querySelectorAll(
            ":scope > div > div:nth-child(2) > div>div>div>div>div>div>div:nth-child(2)>div",
          ),
        );
      }

      if (dotsList.length === 0) {
        const imgList = articleNode.querySelectorAll(
          `${isPostView ? ":scope>div>div:nth-child(1)" : ""} li img`,
        );
        const { x, right } = articleNode.getBoundingClientRect();
        for (const item of Array.from(imgList)) {
          const rect = item.getBoundingClientRect();
          if (rect.x > x && rect.right < right) {
            url = item.getAttribute("src");
            return { url };
          }
        }
        return null;
      }
      mediaIndex = dotsList.findIndex((i) => i.classList.length === 2);
      if (mediaIndex === -1) mediaIndex = 0;
    }
    res = await getUrlFromInfoApi(articleNode, mediaIndex);
    url = res?.url as string | undefined;
    if (!url) {
      const listElements = Array.from(
        articleNode.querySelectorAll<HTMLLIElement>(
          `:scope > div > div:nth-child(${
            isPostView ? 1 : 2
          }) > div > div:nth-child(1) ul li[style*="translateX"]`,
        ),
      );
      const listElementWidth = Math.max(...listElements.map((el) => el.clientWidth));
      const positionsMap = listElements.reduce<Record<string, HTMLLIElement>>(
        (result, element) => {
          const position = Math.round(
            Number(element.style.transform.match(/-?(\d+)/)?.[1]) / listElementWidth,
          );
          return { ...result, [position]: element };
        },
        {},
      );

      const node = positionsMap[mediaIndex];
      if (node) {
        const videoElem = node.querySelector("video");
        const imgElem = node.querySelector("img");
        if (videoElem) {
          url = await getVideoSrc(articleNode, videoElem);
        } else if (imgElem) {
          url = imgElem.getAttribute("src");
        }
      }
    }
  }
  return { url, res, mediaIndex };
}

export async function postOnClicked(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  const { setting_format_use_indexing } = storageCache.settings;
  try {
    const articleNode = getParentArticleNode(target);
    if (!articleNode) throw new Error("cannot find article node");

    const data = await postGetUrl(articleNode);
    if (!data?.url) throw new Error("post cannot get url");

    const { url, res, mediaIndex } = data;

    if (target.className.includes("download-btn") || saveAs) {
      let postTime: string | number | null | undefined;
      let posterName: string | undefined;
      if (res) {
        posterName = res.owner as string;
        postTime = dayjs.unix(res.taken_at as number).valueOf();
      } else {
        postTime = articleNode.querySelector("time")?.getAttribute("datetime");
        posterName = articleNode.querySelector("a")?.getAttribute("href")?.replace(/\//g, "");
      }
      await downloadViaFlow(
        {
          url,
          username: posterName,
          datetime: postTime ? dayjs(postTime as string | number) : undefined,
          id: ((res?.origin_data as { id?: string })?.id) || getMediaName(url),
          index:
            setting_format_use_indexing && mediaIndex !== undefined && mediaIndex >= 0
              ? mediaIndex + 1
              : undefined,
          type: "post",
        },
        saveAs,
      );
    } else {
      openInNewTab(url);
    }
  } catch (err) {
    console.warn("[igdl] postOnClicked", err);
    reportFailure(err instanceof Error ? err.message : "post download failed");
  }
}
