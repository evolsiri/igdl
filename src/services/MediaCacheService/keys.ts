/**
 * Cache key constants for MediaCacheService. All caches live under
 * `chrome.storage.local` with the `igdl_cache_` prefix. Keys are cleared on
 * `chrome.runtime.onStartup`; they are not sync'd across devices.
 *
 * The four reference-parity caches mirror the reference extension's storage
 * shape (loose projection — populated lazily as new endpoints are observed).
 * The two igdl-only caches (post, threads-post) support resolver methods
 * the reference doesn't need (post carousels reached via intercepted XHR,
 * Threads reached via externally_connectable).
 */

export const CACHE_KEYS = {
  // Reference-parity
  idToUsernameMap: "igdl_cache_id_to_username_map",
  userProfilePicUrl: "igdl_cache_user_profile_pic_url",
  storiesReelsMedia: "igdl_cache_stories_reels_media",
  reelsEdgesData: "igdl_cache_reels_edges_data",
  // igdl-only
  postMedia: "igdl_cache_post_media",
  highlightMedia: "igdl_cache_highlight_media",
  threadsPostMedia: "igdl_cache_threads_post_media",
} as const;

export type CacheKey = (typeof CACHE_KEYS)[keyof typeof CACHE_KEYS];

export const ALL_CACHE_KEYS: readonly CacheKey[] = Object.values(CACHE_KEYS);
