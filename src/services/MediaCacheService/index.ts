import type { MediaResource } from "../../types/instagram";
import type {
  HighlightMedia,
  IdToUsernameMap,
  PostMedia,
  ReelsEdgesData,
  StoriesReelsMedia,
  ThreadsPostMedia,
  UserProfilePicUrl,
} from "../../types/media-cache";
import { chromeStorageLocal, type KvStorage } from "../SettingsService/storage";
import { ALL_CACHE_KEYS, CACHE_KEYS } from "./keys";

export interface MediaCacheServiceOptions {
  /** Custom storage adapter; defaults to `chromeStorageLocal()`. */
  storage?: KvStorage;
}

export interface MediaCacheService {
  /**
   * Resolves all downloadable resources for a feed/detail post. One-item arrays
   * for non-carousel posts; N-item arrays for carousels. Empty array on cache
   * miss or malformed payload (never throws).
   *
   * @example
   * const items = await cache.resolveMediaForPost("ABC123");
   * // → [{ url, id: "ABC123", type: "post", username: "alice", index: 1, extension: "jpg", isVideo: false }, ...]
   */
  resolveMediaForPost(postId: string): Promise<MediaResource[]>;

  /**
   * Resolves the video URL for a reel. Falls back to `stories_reels_media` when
   * the reel isn't in `reels_edges_data`. Returns `[]` on cache miss.
   *
   * @example
   * const items = await cache.resolveMediaForReel("REEL123");
   */
  resolveMediaForReel(reelId: string): Promise<MediaResource[]>;

  /**
   * Resolves the media URL for a single story. Stories are always one item
   * per id (Instagram stories aren't carousels).
   *
   * @example
   * const items = await cache.resolveMediaForStory("STORY123");
   */
  resolveMediaForStory(storyId: string): Promise<MediaResource[]>;

  /**
   * Resolves the media URL for a highlight item.
   *
   * @example
   * const items = await cache.resolveMediaForHighlight("HILITE123");
   */
  resolveMediaForHighlight(highlightId: string): Promise<MediaResource[]>;

  /**
   * Resolves a profile avatar as a single MediaResource. Returns null if no
   * avatar is cached for the username.
   *
   * @example
   * const avatar = await cache.resolveMediaForAvatar("alice");
   */
  resolveMediaForAvatar(username: string): Promise<MediaResource | null>;

  /**
   * Resolves all downloadable resources for a Threads post. Populated via the
   * `externally_connectable` bridge from `threads.com` page scripts.
   *
   * @example
   * const items = await cache.resolveMediaForThreadsPost("THRD123");
   */
  resolveMediaForThreadsPost(postId: string): Promise<MediaResource[]>;

  /**
   * Returns the author username for a feed post id, or null on cache miss.
   * This is the feed-click handler's single source of truth for who authored
   * a post — populated by the XHR-interception layer from intercepted feed
   * GraphQL responses. See PLAN.md Round 7 decision 30.
   *
   * @example
   * const username = await cache.getUsernameForPost("ABC123");
   */
  getUsernameForPost(postId: string): Promise<string | null>;

  /**
   * Single entry point for cache writes from the XHR-interception layer.
   * Dispatches on endpoint substring into the matching cache key. Unknown
   * endpoints are a no-op (not an error — Instagram emits many endpoints
   * we don't care about).
   *
   * Dispatches by endpoint substring; parsers are added as new endpoints are
   * observed in live responses.
   *
   * @example
   * cache.ingestXhrSnapshot("/api/v1/feed/timeline/", { ... });
   */
  ingestXhrSnapshot(endpoint: string, body: unknown): Promise<void>;

  /**
   * Clears every cache key this service owns. Invoked from the background
   * on `chrome.runtime.onStartup` — caches are ephemeral.
   *
   * @example
   * await cache.clearAll();
   */
  clearAll(): Promise<void>;
}

/**
 * Creates a MediaCacheService backed by `chrome.storage.local`. Tests should
 * pass a custom `storage` adapter (`inMemoryStorage()`).
 *
 * @example
 * const cache = createMediaCacheService();
 * const username = await cache.getUsernameForPost("ABC123");
 */
export function createMediaCacheService(
  options: MediaCacheServiceOptions = {},
): MediaCacheService {
  const storage = options.storage ?? chromeStorageLocal();

  async function getRaw<T>(key: string): Promise<T | undefined> {
    return storage.get<T>(key);
  }

  async function setRaw<T>(key: string, value: T): Promise<void> {
    await storage.set(key, value);
  }

  async function patchRaw<T extends Record<string, unknown>>(
    key: string,
    updater: (prev: T) => T,
  ): Promise<void> {
    const prev = ((await getRaw<T>(key)) ?? ({} as T)) as T;
    await setRaw(key, updater(prev));
  }

  return {
    async resolveMediaForPost(postId) {
      const cache = await getRaw<PostMedia>(CACHE_KEYS.postMedia);
      const entry = cache?.[postId];
      if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) return [];
      return entry.items.map((item, i) => ({
        url: item.url,
        id: postId,
        type: "post" as const,
        username: entry.username,
        index: entry.items.length > 1 ? i + 1 : undefined,
        extension: item.extension,
        isVideo: item.isVideo,
      }));
    },

    async resolveMediaForReel(reelId) {
      const reels = await getRaw<ReelsEdgesData>(CACHE_KEYS.reelsEdgesData);
      const edge = reels?.[reelId];
      if (edge && typeof edge.url === "string") {
        return [
          {
            url: edge.url,
            id: reelId,
            type: "reel",
            username: edge.username,
            extension: edge.extension,
            isVideo: edge.isVideo,
          },
        ];
      }
      // Fall back to stories_reels_media (some reels land there instead)
      const stories = await getRaw<StoriesReelsMedia>(CACHE_KEYS.storiesReelsMedia);
      const item = stories?.[reelId];
      if (item && typeof item.url === "string") {
        return [
          {
            url: item.url,
            id: reelId,
            type: "reel",
            username: item.username,
            extension: item.extension,
            isVideo: item.isVideo,
          },
        ];
      }
      return [];
    },

    async resolveMediaForStory(storyId) {
      const stories = await getRaw<StoriesReelsMedia>(CACHE_KEYS.storiesReelsMedia);
      const item = stories?.[storyId];
      if (!item || typeof item.url !== "string") return [];
      return [
        {
          url: item.url,
          id: storyId,
          type: "story",
          username: item.username,
          extension: item.extension,
          isVideo: item.isVideo,
        },
      ];
    },

    async resolveMediaForHighlight(highlightId) {
      const highlights = await getRaw<HighlightMedia>(CACHE_KEYS.highlightMedia);
      const item = highlights?.[highlightId];
      if (!item || typeof item.url !== "string") return [];
      return [
        {
          url: item.url,
          id: highlightId,
          type: "highlight",
          username: item.username,
          extension: item.extension,
          isVideo: item.isVideo,
        },
      ];
    },

    async resolveMediaForAvatar(username) {
      const avatars = await getRaw<UserProfilePicUrl>(CACHE_KEYS.userProfilePicUrl);
      const url = avatars?.[username];
      if (typeof url !== "string" || url.length === 0) return null;
      const extension = extractExtension(url, "jpg");
      return {
        url,
        id: username,
        type: "avatar",
        username,
        extension,
        isVideo: false,
      };
    },

    async resolveMediaForThreadsPost(postId) {
      const cache = await getRaw<ThreadsPostMedia>(CACHE_KEYS.threadsPostMedia);
      const entry = cache?.[postId];
      if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) return [];
      return entry.items.map((item, i) => ({
        url: item.url,
        id: postId,
        type: "threads" as const,
        username: entry.username,
        index: entry.items.length > 1 ? i + 1 : undefined,
        extension: item.extension,
        isVideo: item.isVideo,
      }));
    },

    async getUsernameForPost(postId) {
      const map = await getRaw<IdToUsernameMap>(CACHE_KEYS.idToUsernameMap);
      const value = map?.[postId];
      return typeof value === "string" && value.length > 0 ? value : null;
    },

    async ingestXhrSnapshot(endpoint, body) {
      // Dispatch by endpoint substring. Extend this map with the specific
      // Instagram endpoints observed in live traffic.
      if (!isRecord(body)) return;

      if (endpoint.includes("/api/v1/users/web_profile_info/")) {
        const parsed = parseWebProfileInfo(body);
        if (parsed) {
          await patchRaw<UserProfilePicUrl>(CACHE_KEYS.userProfilePicUrl, (prev) => ({
            ...prev,
            [parsed.username]: parsed.avatarUrl,
          }));
        }
        return;
      }

      if (endpoint.includes("/api/v1/feed/timeline/")) {
        const idMap = parseTimelineIdMap(body);
        if (Object.keys(idMap).length > 0) {
          await patchRaw<IdToUsernameMap>(CACHE_KEYS.idToUsernameMap, (prev) => ({
            ...prev,
            ...idMap,
          }));
        }
        return;
      }

      // Other endpoints are silently ignored until a parser is added.
    },

    async clearAll() {
      await storage.removeMany([...ALL_CACHE_KEYS]);
    },
  };
}

// --- Helpers -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractExtension(url: string, fallback: string): string {
  const match = /\.([a-zA-Z0-9]{2,5})(?:\?|$)/.exec(url);
  return match ? match[1].toLowerCase() : fallback;
}

/**
 * Parses the GraphQL/REST `web_profile_info` response shape. Tolerates
 * unknown fields; returns null if username or avatar url is missing.
 */
function parseWebProfileInfo(
  body: Record<string, unknown>,
): { username: string; avatarUrl: string } | null {
  const data = isRecord(body.data) ? body.data : body;
  const user = isRecord((data as Record<string, unknown>).user)
    ? ((data as Record<string, unknown>).user as Record<string, unknown>)
    : null;
  if (!user) return null;
  const username = typeof user.username === "string" ? user.username : null;
  const avatarUrl =
    typeof user.profile_pic_url_hd === "string"
      ? user.profile_pic_url_hd
      : typeof user.profile_pic_url === "string"
        ? user.profile_pic_url
        : null;
  if (!username || !avatarUrl) return null;
  return { username, avatarUrl };
}

/**
 * Parses an Instagram timeline feed response and extracts post id → username.
 * Tolerant of shape drift: walks any array-of-items that has `id` + `user.username`.
 */
function parseTimelineIdMap(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const items = extractItems(body);
  for (const item of items) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id : typeof item.pk === "string" ? item.pk : null;
    const user = isRecord(item.user) ? item.user : null;
    const username = user && typeof user.username === "string" ? user.username : null;
    if (id && username) out[id] = username;
  }
  return out;
}

function extractItems(body: Record<string, unknown>): unknown[] {
  if (Array.isArray(body.items)) return body.items;
  if (Array.isArray(body.feed_items)) return body.feed_items;
  if (isRecord(body.data)) {
    const data = body.data as Record<string, unknown>;
    if (Array.isArray(data.items)) return data.items;
  }
  return [];
}
