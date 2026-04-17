import dayjs, { type Dayjs } from "dayjs";
import { buildFilename } from "../../services/download/naming";
import { createToastService, type ToastService } from "../../services/toast/toast";
import {
  createZipService,
  type ZipEntry,
  type ZipService,
} from "../../services/zip/zip";
import { triggerAnchorDownload } from "../../services/zip/download";
import type { MediaResource } from "../../types/instagram";
import type { Settings } from "../../types/settings";
import { reportFailure } from "../downloadBridge";
import { getParentArticleNode } from "../extractors/dom";
import { getDataFromAPI, getImgOrVideoUrl } from "../extractors/fn";
import { inferExtension } from "../extractors/filename";
import { storageCache } from "../extractors/storage";

/**
 * Dependencies the zip handler pulls from module scope. Injectable for tests
 * so unit tests don't need a live `chrome.*` environment.
 */
export interface ZipHandlerDeps {
  zipService: ZipService;
  toast: ToastService;
  downloadBlob: (blob: Blob, filename: string) => void;
  /** Resolves the Instagram info-API payload for the article that owns `node`. */
  getInfo: (articleNode: HTMLElement | null) => Promise<Record<string, unknown> | null>;
  /** Walks up from `node` to the enclosing `<article>`. */
  getArticle: (node: HTMLElement | null) => HTMLElement | null;
  /** Synchronous Settings snapshot — content script pulls from `storageCache.canonical`. */
  getSettings: () => Settings;
  /** Reports a user-facing failure message. Defaults to the shared toast-failure reporter. */
  onFailure: (message: string) => void;
}

let cached: ZipHandlerDeps | null = null;

function getDefaultDeps(): ZipHandlerDeps {
  if (!cached) {
    cached = {
      zipService: createZipService(),
      toast: createToastService(),
      downloadBlob: triggerAnchorDownload,
      getInfo: getDataFromAPI,
      getArticle: getParentArticleNode,
      getSettings: () => storageCache.canonical,
      onFailure: reportFailure,
    };
  }
  return cached;
}

/**
 * Test-only: reset the memoized default deps so the next call re-initializes
 * them.
 *
 * @example
 * afterEach(() => __resetZipHandlerDepsForTesting());
 */
export function __resetZipHandlerDepsForTesting(): void {
  cached = null;
}

/**
 * Handles a click on the injected `zip-btn` next to a carousel post's like
 * icon. Resolves every carousel item via Instagram's media info API, streams
 * each one through `ZipService.build`, and writes the resulting `.zip` to
 * disk via an anchor-click (see `ZipService/download.ts` for why this path
 * is used instead of `chrome.downloads`).
 *
 * On success, fires a green "Downloaded zip from @user" toast. On any
 * failure — missing article node, non-carousel post, info-API miss, fetch
 * error — fires a red failure toast with the cause in the message.
 *
 * @example
 * document.body.addEventListener("click", (e) => {
 *   const btn = e.target.closest(".igdl-custom-btn.zip-btn");
 *   if (btn) zipOnClicked(btn as HTMLAnchorElement);
 * });
 */
export async function zipOnClicked(
  target: HTMLAnchorElement,
  deps: ZipHandlerDeps = getDefaultDeps(),
): Promise<void> {
  try {
    const articleNode = deps.getArticle(target);
    if (!articleNode) throw new Error("cannot find article node");

    const info = await deps.getInfo(articleNode);
    if (!info) throw new Error("cannot resolve post media");

    const carousel = Array.isArray(info.carousel_media)
      ? (info.carousel_media as Array<Record<string, unknown>>)
      : null;
    if (!carousel || carousel.length < 2) {
      throw new Error("not a carousel post");
    }

    const owner =
      (info.owner as { username?: string } | undefined)?.username?.trim() || "instagram";
    const postId = readPostId(info);
    const takenAt = readTakenAt(info);
    const settings = deps.getSettings();

    const resources = buildCarouselResources(carousel, owner, postId);
    const entries = buildZipEntries(resources, settings, takenAt);
    const outerFilename = buildOuterFilename(owner, postId, settings, takenAt);

    const blob = await deps.zipService.build(entries);
    deps.downloadBlob(blob, outerFilename);

    const suffix = resources.length === 1 ? "item" : "items";
    deps.toast.success(`Downloaded ${resources.length} ${suffix} from @${owner} as zip`);
  } catch (err) {
    console.warn("[igdl] zipOnClicked", err);
    deps.onFailure(err instanceof Error ? err.message : "zip download failed");
  }
}

function readPostId(info: Record<string, unknown>): string {
  if (typeof info.id === "string" && info.id.length > 0) return info.id;
  if (typeof info.pk === "string" && info.pk.length > 0) return info.pk;
  if (typeof info.code === "string" && info.code.length > 0) return info.code;
  return "post";
}

function readTakenAt(info: Record<string, unknown>): Dayjs {
  const raw = info.taken_at;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return dayjs.unix(raw);
  }
  return dayjs();
}

function buildCarouselResources(
  carousel: Array<Record<string, unknown>>,
  owner: string,
  postId: string,
): MediaResource[] {
  return carousel.map((item, i) => {
    const url = getImgOrVideoUrl(item);
    return {
      url,
      id: postId,
      type: "post" as const,
      username: owner,
      index: i + 1,
      extension: inferExtension(url),
      isVideo: "video_versions" in item,
    };
  });
}

function buildZipEntries(
  resources: MediaResource[],
  settings: Settings,
  takenAt: Dayjs,
): ZipEntry[] {
  const when = takenAt.toDate();
  return resources.map((resource) => ({
    url: resource.url,
    filename: buildFilename(resource, settings, when),
  }));
}

function buildOuterFilename(
  owner: string,
  postId: string,
  settings: Settings,
  takenAt: Dayjs,
): string {
  const zipResource: MediaResource = {
    url: "",
    id: postId,
    type: "post",
    username: owner,
    extension: "zip",
    isVideo: false,
  };
  return buildFilename(zipResource, settings, takenAt.toDate());
}
