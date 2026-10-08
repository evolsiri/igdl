/**
 * Utilities ported from the reference extension's `src/content/utils/fn.ts`.
 *
 * The key functions are:
 *  - `getDataFromAPI` — fetches `/api/v1/media/{id}/info/` directly, bypassing
 *    the DOM, to get a high-quality media payload (image versions, video
 *    versions, owner username, taken_at).
 *  - `getUrlFromInfoApi` — wraps getDataFromAPI and normalizes single vs
 *    carousel.
 *  - `findPostId` / `findMediaId` / `findAppId` — scrape the page for the
 *    identifiers the info API needs.
 *  - `openInNewTab` — sends an OPEN_URL message to the background.
 *  - `fetchHtml` / `checkType`.
 *
 * These are kept intentionally close to the reference so future upstream
 * changes port cleanly.
 */

import { sendMessage } from "../../utils/messages";

export async function openInNewTab(url: string): Promise<void> {
  const response = await sendMessage({ type: "OPEN_URL", url });
  if (!response.ok) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

const mediaInfoCache: Map<string, Record<string, unknown>> = new Map();
const mediaIdCache: Map<string, string> = new Map();

export function findAppId(): string | null {
  const appIdPattern = /"X-IG-App-ID":"([\d]+)"/;
  const bodyScripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll("body > script");
  for (let i = 0; i < bodyScripts.length; ++i) {
    const match = bodyScripts[i].text.match(appIdPattern);
    if (match) return match[1];
  }
  console.warn("[igdl] cannot find X-IG-App-ID");
  return null;
}

export function findPostId(articleNode: HTMLElement | null): string | null {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/reels/")) return pathname.split("/")[2];
  if (pathname.startsWith("/stories/")) return pathname.split("/")[3];
  if (pathname.startsWith("/reel/")) return pathname.split("/")[2];
  // /:user/reel/:id — the reel's own links on that page are /reel/ links, so
  // the /p/ anchor scan below finds nothing, or another post's link.
  const namedReel = pathname.match(/^\/[^/]+\/reel\/([^/]+)/);
  if (namedReel) return namedReel[1];

  if (!articleNode) return null;
  const postIdPattern = /\/p\/([^/]+)\//;
  const aNodes = articleNode.querySelectorAll("a");
  for (let i = 0; i < aNodes.length; ++i) {
    const link = aNodes[i].getAttribute("href");
    if (link) {
      const match = link.match(postIdPattern);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * Resolves a post's shortcode to the numeric media id the info API wants. On
 * a story page the id is read straight from the URL — unless `isKnownPost`
 * says the caller named the post itself, in which case the page is not
 * consulted: it may have moved on to something else since the click.
 */
export async function findMediaId(postId: string, isKnownPost = false): Promise<string | null> {
  const mediaIdPattern = /instagram:\/\/media\?id=(\d+)|["' ]media_id["' ]:["' ](\d+)["' ]/;
  if (!isKnownPost) {
    const match = window.location.href.match(/www\.instagram\.com\/stories\/[^/]+\/(\d+)/);
    if (match) return match[1];
  }
  // The id becomes a path segment of a same-origin request, and it can come
  // from page data. Shortcodes and story ids are plain word characters.
  if (!/^[\w-]+$/.test(postId)) return null;
  if (!mediaIdCache.has(postId)) {
    const postUrl = `https://www.instagram.com/p/${postId}/`;
    const resp = await fetch(postUrl);
    const text = await resp.text();
    const idMatch = text.match(mediaIdPattern);
    if (!idMatch) return null;
    let mediaId: string | null = null;
    for (let i = 0; i < idMatch.length; ++i) {
      if (idMatch[i]) mediaId = idMatch[i];
    }
    if (!mediaId) return null;
    mediaIdCache.set(postId, mediaId);
  }
  return mediaIdCache.get(postId) ?? null;
}

export function getImgOrVideoUrl(item: Record<string, unknown>): string | null {
  if ("video_versions" in item) {
    const versions = item.video_versions as Array<{ url: string }>;
    return versions[0]?.url ?? null;
  }
  const image = item.image_versions2 as { candidates: Array<{ url: string }> } | undefined;
  return image?.candidates[0]?.url ?? null;
}

/**
 * Fetches the info-API item for a post. The post is found from the page —
 * the URL, or the links inside `articleNode` — unless `knownPostId` names it.
 * Pass `knownPostId` whenever the caller already knows which post it means
 * and an `await` has happened since: on the reels feed the URL moves on as
 * the user scrolls.
 */
export async function getDataFromAPI(
  articleNode: HTMLElement | null,
  knownPostId?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const appId = findAppId();
    if (!appId) return null;
    const postId = knownPostId ?? findPostId(articleNode);
    if (!postId) return null;
    const mediaId = await findMediaId(postId, knownPostId !== undefined);
    if (!mediaId) return null;

    if (!mediaInfoCache.has(mediaId)) {
      const url = `https://i.instagram.com/api/v1/media/${mediaId}/info/`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "X-IG-App-ID": appId,
        },
        credentials: "include",
        mode: "cors",
        referrerPolicy: "no-referrer",
      });
      if (resp.status !== 200) {
        console.warn(`[igdl] info API failed: ${resp.status}`);
        return null;
      }
      const respJson = (await resp.json()) as Record<string, unknown>;
      mediaInfoCache.set(mediaId, respJson);
    }
    const infoJson = mediaInfoCache.get(mediaId);
    const items = (infoJson?.items as Array<Record<string, unknown>>) ?? [];
    return items[0] ?? null;
  } catch (err) {
    console.warn("[igdl] getDataFromAPI error", err);
    return null;
  }
}

/**
 * `getDataFromAPI`, flattened for a download: a carousel yields the item at
 * `mediaIdx`, and `url`, `owner` and `coauthor_producers` are filled in.
 * `knownPostId` works as it does there.
 */
export async function getUrlFromInfoApi(
  articleNode: HTMLElement | null,
  mediaIdx = 0,
  knownPostId?: string,
): Promise<Record<string, unknown> | null> {
  const data = await getDataFromAPI(articleNode, knownPostId);
  if (!data) return null;

  if ("carousel_media" in data) {
    const arr = data.carousel_media as Array<Record<string, unknown>>;
    const item = arr[Math.max(mediaIdx, 0)];
    const owner =
      (item.owner as { username?: string } | undefined)?.username ||
      (data.owner as { username?: string } | undefined)?.username ||
      "unknown";
    return {
      ...item,
      url: getImgOrVideoUrl(item),
      taken_at: data.taken_at,
      owner,
      coauthor_producers:
        (data.coauthor_producers as Array<{ username?: string }> | undefined)?.map(
          (i) => i.username,
        ) ?? [],
      origin_data: data,
    };
  }

  return {
    ...data,
    url: getImgOrVideoUrl(data),
    owner: (data.owner as { username?: string } | undefined)?.username ?? "unknown",
    coauthor_producers:
      (data.coauthor_producers as Array<{ username?: string }> | undefined)?.map(
        (i) => i.username,
      ) ?? [],
  };
}

export function checkType(): "ios" | "android" | "pc" {
  if (
    typeof navigator !== "undefined" &&
    navigator.userAgent &&
    /Mobi|Android|iPhone/i.test(navigator.userAgent)
  ) {
    if (/(iPhone|iPad|iPod|iOS)/i.test(navigator.userAgent)) return "ios";
    return "android";
  }
  return "pc";
}

export async function fetchHtml(): Promise<NodeListOf<HTMLScriptElement>> {
  const resp = await fetch(window.location.href, { referrerPolicy: "no-referrer" });
  const content = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  return doc.querySelectorAll("script");
}
