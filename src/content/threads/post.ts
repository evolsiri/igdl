import dayjs from "dayjs";
import { downloadViaFlow, reportFailure } from "../downloadBridge";
import { getMediaName } from "../extractors/filename";
import { openInNewTab } from "../extractors/fn";

interface ThreadPost {
  giphy_media_info?: {
    first_party_cdn_proxied_images?: { fixed_height?: { webp?: string } };
  };
  carousel_media?: Array<{
    video_versions?: Array<{ url: string }>;
    image_versions2?: { candidates?: Array<{ url: string }> };
  }>;
  image_versions2?: { candidates?: Array<{ url: string }> };
  video_versions?: Array<{ url: string }>;
  text_post_app_info?: {
    linked_inline_media?: {
      video_versions?: Array<{ url: string }>;
      carousel_media?: Array<{
        video_versions?: Array<{ url: string }>;
        image_versions2?: { candidates?: Array<{ url: string }> };
      }>;
    };
  };
  user: { username: string };
  taken_at: number;
}

function findFeedDataEdges(obj: unknown): Array<Record<string, unknown>> | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  if (Array.isArray(record.edges)) return record.edges as Array<Record<string, unknown>>;
  const relatedThreads = (record.relatedPosts as { threads?: unknown } | undefined)?.threads;
  if (Array.isArray(relatedThreads))
    return relatedThreads as Array<Record<string, unknown>>;

  for (const key in record) {
    const value = record[key];
    if (typeof value === "object") {
      const result = findFeedDataEdges(value);
      if (result) return result;
    } else if (Array.isArray(value)) {
      for (const item of value as unknown[]) {
        const result = findFeedDataEdges(item);
        if (result) return result;
      }
    }
  }
  return null;
}

async function dispatchMedia(post: ThreadPost, action: "download" | "open" | "saveAs"): Promise<void> {
  const final = async (params: {
    url: string;
    username: string;
    datetime: dayjs.Dayjs;
    id: string;
  }): Promise<void> => {
    if (action === "download" || action === "saveAs") {
      await downloadViaFlow({ ...params, type: "threads" }, action === "saveAs");
    } else {
      openInNewTab(params.url);
    }
  };

  const username = post.user.username;
  const datetime = dayjs.unix(post.taken_at);

  if (post.giphy_media_info?.first_party_cdn_proxied_images?.fixed_height?.webp) {
    const url = post.giphy_media_info.first_party_cdn_proxied_images.fixed_height.webp;
    await final({ url, username, datetime, id: getMediaName(url) });
    return;
  }

  if (Array.isArray(post.carousel_media) && post.carousel_media.length > 0) {
    for (const item of post.carousel_media) {
      const url =
        item.video_versions?.[0]?.url || item.image_versions2?.candidates?.[0]?.url;
      if (!url) continue;
      await final({ url, username, datetime, id: getMediaName(url) });
    }
    return;
  }

  const url =
    post.video_versions?.[0]?.url || post.image_versions2?.candidates?.[0]?.url;
  if (url) {
    await final({ url, username, datetime, id: getMediaName(url) });
    return;
  }

  const linked = post.text_post_app_info?.linked_inline_media;
  if (linked?.video_versions) {
    const linkedUrl = linked.video_versions[0]?.url;
    if (linkedUrl) {
      await final({ url: linkedUrl, username, datetime, id: getMediaName(linkedUrl) });
      return;
    }
  }
  if (linked?.carousel_media) {
    for (const item of linked.carousel_media) {
      const itemUrl =
        item.video_versions?.[0]?.url || item.image_versions2?.candidates?.[0]?.url;
      if (!itemUrl) continue;
      await final({ url: itemUrl, username, datetime, id: getMediaName(itemUrl) });
    }
  }
}

export async function handleThreadsPost(
  container: HTMLDivElement,
  action: "download" | "open" | "saveAs",
): Promise<void> {
  try {
    const anchor = Array.from(container.querySelectorAll("a")).find((i) =>
      /\w+\/post\/\w+/.test(i.href),
    );
    const postCode = anchor?.href.split("/post/")[1];
    if (!postCode) return;

    const cache = (await chrome.storage.local.get(["threads"])) as {
      threads?: Array<[string, { post?: ThreadPost } | ThreadPost]>;
    };
    const data = new Map(cache.threads || []);
    const thread = data.get(postCode) as { post?: ThreadPost } | ThreadPost | undefined;
    if (thread) {
      const post = (thread as { post?: ThreadPost }).post || (thread as ThreadPost);
      await dispatchMedia(post, action);
      return;
    }

    for (const script of Array.from(window.document.scripts)) {
      try {
        const innerHTML = script.innerHTML;
        const parsed = JSON.parse(innerHTML);
        if (innerHTML.includes("thread_items")) {
          const arr = findFeedDataEdges(parsed);
          if (Array.isArray(arr)) {
            const match = arr
              .map((i) => {
                const node = (i as { node?: Record<string, unknown> }).node ?? i;
                return (
                  (node as { text_post_app_thread?: { thread_items?: unknown[] } })
                    ?.text_post_app_thread?.thread_items ||
                  (node as { thread_items?: unknown[] })?.thread_items ||
                  (node as { thread?: { thread_items?: unknown[] } })?.thread?.thread_items
                );
              })
              .flat()
              .find((i) => {
                const post = (i as { post?: { code?: string } } | undefined)?.post;
                return post?.code === postCode;
              });
            if (match) {
              const post = (match as { post?: ThreadPost }).post;
              if (post) {
                await dispatchMedia(post, action);
                return;
              }
            }
          }
        }
      } catch {
        /* skip malformed script */
      }
    }
    reportFailure("Threads post media not found");
  } catch (err) {
    console.warn("[igdl] handleThreadsPost", err);
    reportFailure(err instanceof Error ? err.message : "Threads download failed");
  }
}
