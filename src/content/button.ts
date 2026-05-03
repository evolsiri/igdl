import { checkType } from "./extractors/fn";
import { storageCache } from "./extractors/storage";
import { downloadViaFlow } from "./downloadBridge";
import { getMediaName, inferExtension } from "./extractors/filename";

/**
 * Ported from the reference extension's `src/content/button.ts`. Creates the
 * injected download button (+ optional "open in new tab" and "zip" siblings)
 * and exposes the global click dispatcher.
 *
 * Visual differences from the reference (per PAC-2.2): 24px SVG icons with a
 * scale-up hover transform. Same `a.igdl-custom-btn` class so the click
 * delegator in `content/index.ts` recognizes our elements.
 */

import { highlightsOnClicked } from "./handlers/highlights";
import { postOnClicked } from "./handlers/post";
import { postDetailOnClicked } from "./handlers/post-detail";
import { profileOnClicked } from "./handlers/profile";
import { handleProfileReel } from "./handlers/profile-reel";
import { reelsOnClicked } from "./handlers/reels";
import { storyOnClicked } from "./handlers/stories";
import { zipOnClicked } from "./handlers/zip";
import { handleThreadsButton } from "./threads/button";

export const CLASS_CUSTOM_BUTTON = "igdl-custom-btn";

export type IconColor = "black" | "white";
export type IconClassName = "download-btn" | "newtab-btn" | "zip-btn";

const DOWNLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
  <path d="M12 4v10.586l3.293-3.293 1.414 1.414L12 17.414 7.293 13.707l1.414-1.414L12 14.586V4h0zM4 20h16v2H4z"/>
</svg>`;

const NEWTAB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
  <path d="M14 3h7v7h-2V6.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V3zM5 5h6v2H5v12h12v-6h2v8H3V5h2z"/>
</svg>`;

const ZIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
  <path d="M4 3h11l5 5v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 2v14h14V9h-4V5H5zm6 3h2v2h-2V8zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
</svg>`;

function createCustomBtn(
  svg: string,
  iconColor: IconColor,
  className: IconClassName,
): HTMLAnchorElement {
  const btn = document.createElement("a");
  btn.innerHTML = svg;
  btn.className = `${CLASS_CUSTOM_BUTTON} ${className}`;
  btn.setAttribute(
    "style",
    [
      "cursor: pointer",
      "padding: 8px",
      "z-index: 0",
      "display: inline-flex",
      "transition: transform 120ms ease-out, filter 120ms ease-out",
      `color: ${iconColor}`,
    ].join(";"),
  );
  btn.onmouseenter = () => {
    btn.style.setProperty("transform", "scale(1.08)");
  };
  btn.onmouseleave = () => {
    btn.style.removeProperty("transform");
  };
  switch (className) {
    case "newtab-btn":
      btn.setAttribute("title", "Open in new tab");
      btn.setAttribute("target", "_blank");
      btn.setAttribute("rel", "noopener,noreferrer");
      break;
    case "download-btn":
      btn.setAttribute("title", "Download");
      break;
    case "zip-btn":
      btn.setAttribute("title", "Download ZIP");
      break;
  }
  return btn;
}

export function addCustomBtn(
  node: Element | null | undefined,
  iconColor: IconColor,
  position: "before" | "after" = "after",
): void {
  if (!node) return;
  const { setting_show_open_in_new_tab_icon, setting_show_zip_download_icon } =
    storageCache.settings;
  const downloadBtn = createCustomBtn(DOWNLOAD_SVG, iconColor, "download-btn");
  let newtabBtn: HTMLAnchorElement | undefined;
  let zipBtn: HTMLAnchorElement | undefined;

  if (!(checkType() !== "pc" && window.location.pathname.startsWith("/stories/"))) {
    if (setting_show_open_in_new_tab_icon) {
      newtabBtn = createCustomBtn(NEWTAB_SVG, iconColor, "newtab-btn");
    }
  }
  if (
    checkType() === "pc" &&
    setting_show_zip_download_icon &&
    window.location.host === "www.instagram.com" &&
    !window.location.pathname.startsWith("/reel") &&
    !window.location.pathname.startsWith("/stories/")
  ) {
    zipBtn = createCustomBtn(ZIP_SVG, iconColor, "zip-btn");
  }

  if (position === "before") {
    if (newtabBtn) node.insertBefore(newtabBtn, node.firstChild);
    node.insertBefore(downloadBtn, node.firstChild);
    if (zipBtn) node.insertBefore(zipBtn, node.firstChild);
  } else {
    if (newtabBtn) node.appendChild(newtabBtn);
    node.appendChild(downloadBtn);
    if (zipBtn) node.appendChild(zipBtn);
  }
}

export function addVideoDownloadCoverBtn(node: HTMLDivElement): void {
  const btn = document.createElement("a");
  btn.innerHTML = DOWNLOAD_SVG;
  btn.className = CLASS_CUSTOM_BUTTON;
  btn.setAttribute(
    "style",
    "cursor:pointer;position:absolute;left:4px;top:4px;color:white;filter:drop-shadow(0 0 2px rgba(0,0,0,0.5));z-index:2;transition:transform 120ms ease-out;",
  );
  btn.setAttribute("title", "Download video cover");
  btn.dataset.videoCoverDownload = "true";
  btn.onmouseenter = () => {
    btn.style.setProperty("transform", "scale(1.1)");
  };
  btn.onmouseleave = () => {
    btn.style.removeProperty("transform");
  };
  node.appendChild(btn);
}

export function handleVideoCoverDownloadBtn(node: HTMLElement): void {
  if (window.location.pathname.split("/")[2] === "reels") {
    const bgEl = node.querySelector<HTMLElement>('[style*="background-image"]');
    if (bgEl) {
      const raw = window
        .getComputedStyle(bgEl)
        .getPropertyValue("background-image")
        .match(/url\((.*)\)/)?.[1];
      if (raw) {
        const url = JSON.parse(raw);
        downloadViaFlow({ url, id: getMediaName(url) });
      }
    }
  } else {
    const imgSrc = node.querySelector("img")?.getAttribute("src");
    if (imgSrc) {
      downloadViaFlow({ url: imgSrc, id: getMediaName(imgSrc) });
    }
  }
  void inferExtension;
}

/**
 * Dispatches a click on any `.igdl-custom-btn` anchor to the right handler
 * based on URL. Called by the global click delegator in content/index.ts.
 */
export function onClickHandler(currentTarget: Element, saveAs = false): void {
  if (!(currentTarget instanceof HTMLAnchorElement)) return;

  if (window.location.origin === "https://www.threads.com") {
    handleThreadsButton(currentTarget, saveAs);
    return;
  }

  // ZIP button has a completely different pipeline (fetches every carousel
  // item, builds a .zip in content, anchor-click downloads). Short-circuit
  // before the per-surface routing table below.
  if (currentTarget.classList.contains("zip-btn")) {
    void zipOnClicked(currentTarget);
    return;
  }

  const pathPrefix = window.location.pathname;
  const pathnameList = pathPrefix.split("/").filter((e) => e);
  const isPostDetailWithNameInUrl = pathnameList.length === 3 && pathnameList[1] === "p";
  const isReelDetailWithNameInUrl = pathnameList.length === 3 && pathnameList[1] === "reel";

  let fn: (target: HTMLAnchorElement, saveAs: boolean) => Promise<unknown> = postOnClicked;
  if (
    document.querySelector("section>main>div>header>section:nth-child(2)")?.contains(currentTarget)
  ) {
    fn = profileOnClicked;
  } else if (pathPrefix.startsWith("/reels/")) {
    fn = reelsOnClicked;
  } else if (pathPrefix.startsWith("/stories/highlights/")) {
    fn = highlightsOnClicked;
  } else if (pathPrefix.startsWith("/stories/")) {
    fn = storyOnClicked;
  } else if (pathPrefix.startsWith("/reel/")) {
    fn = handleProfileReel;
  } else if (pathPrefix.startsWith("/p/")) {
    if (document.querySelector('div[role="dialog"]')) {
      fn = postOnClicked;
    } else {
      fn = postDetailOnClicked;
    }
  } else if (isPostDetailWithNameInUrl || isReelDetailWithNameInUrl) {
    fn = postDetailOnClicked;
  }

  fn(currentTarget, saveAs);
}
