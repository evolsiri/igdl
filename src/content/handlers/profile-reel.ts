import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { getMediaName } from "../extractors/filename";
import { checkType, getUrlFromInfoApi, openInNewTab } from "../extractors/fn";

async function fetchVideoURL(
  containerNode: HTMLElement,
  videoElem: HTMLVideoElement,
): Promise<string> {
  const poster = videoElem.getAttribute("poster");
  const timeNodes = containerNode.querySelectorAll("time");
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
  containerNode: HTMLElement,
  videoElem: HTMLVideoElement,
): Promise<string | null> {
  let url = videoElem.getAttribute("src");
  if (videoElem.hasAttribute("videoURL")) {
    url = videoElem.getAttribute("videoURL");
  } else if (url === null || url.includes("blob")) {
    url = await fetchVideoURL(containerNode, videoElem);
  }
  return url;
}

async function getUrl(): Promise<
  { url?: string | null; res?: Record<string, unknown> | null } | undefined
> {
  const containerNode = document.querySelector<HTMLElement>("section main");
  if (!containerNode) return undefined;

  const pathnameList = window.location.pathname.split("/").filter((e) => e);
  const isPostDetailWithNameInUrl = pathnameList.length === 3 && pathnameList[1] === "p";
  const mediaList = containerNode.querySelectorAll("li[style][class]");

  let url: string | null | undefined;
  let res: Record<string, unknown> | null | undefined;

  if (mediaList.length === 0) {
    res = await getUrlFromInfoApi(containerNode);
    url = res?.url as string | undefined;
    if (!url) {
      const videoElem = containerNode.querySelector<HTMLVideoElement>("article div > video");
      const imgElem = containerNode.querySelector<HTMLImageElement>(
        "article div[role] div > img",
      );
      if (videoElem) url = await getVideoSrc(containerNode, videoElem);
      else if (imgElem) url = imgElem.getAttribute("src");
    }
  } else {
    let dotsList: NodeListOf<Element>;
    if (checkType() === "pc") {
      dotsList = isPostDetailWithNameInUrl
        ? containerNode.querySelectorAll("article>div>div:nth-child(1)>div>div:nth-child(2)>div")
        : containerNode.querySelectorAll(
            "div[role=button]>div>div>div>div:nth-child(2)>div",
          );
    } else {
      dotsList = containerNode.querySelectorAll(
        'div[role=button][aria-hidden="true"][tabindex="0"]>div>div>div>div:nth-child(2)>div',
      );
    }
    const mediaIndex = Array.from(dotsList).findIndex((i) => i.classList.length === 2);
    res = await getUrlFromInfoApi(containerNode, mediaIndex);
    url = res?.url as string | undefined;
    if (!url) {
      const listElements = Array.from(
        containerNode.querySelectorAll<HTMLLIElement>(
          ':scope > div > div:nth-child(1) > div > div:nth-child(1) ul li[style*="translateX"]',
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
        if (videoElem) url = await getVideoSrc(containerNode, videoElem);
        else if (imgElem) url = imgElem.getAttribute("src");
      }
    }
  }
  return { url, res };
}

export async function handleProfileReel(target: HTMLAnchorElement, saveAs = false): Promise<void> {
  try {
    const data = await getUrl();
    if (!data?.url) throw new Error("profile reel cannot get url");

    const { url, res } = data;
    if (target.className.includes("download-btn") || saveAs) {
      let postTime: string | number | null | undefined;
      let posterName: string | undefined;
      if (res) {
        posterName = res.owner as string;
        postTime = ((res.taken_at as number) ?? 0) * 1000;
      } else {
        postTime = document.querySelector("time")?.getAttribute("datetime");
        const name = document.querySelector<HTMLDivElement>(
          "section main>div>div>div>div:nth-child(2)>div>div>div>div:nth-child(2)>div>div>div",
        );
        if (name) posterName = name.innerText || posterName;
      }
      await downloadViaFlow(
        {
          url,
          username: posterName,
          datetime: postTime ? dayjs(postTime as string | number) : undefined,
          id: getMediaName(url),
          type: "reel",
        },
        saveAs,
      );
    } else {
      openInNewTab(url);
    }
  } catch (err) {
    console.warn("[igdl] handleProfileReel", err);
    reportFailure(err instanceof Error ? err.message : "profile reel download failed");
  }
}
