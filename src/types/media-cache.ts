/**
 * Shapes stored under `MediaCacheService`'s cache keys. All caches are
 * ephemeral: they live only in `chrome.storage.local` and are cleared on
 * `chrome.runtime.onStartup`. Handlers never read these shapes directly —
 * they go through `MediaCacheService.resolveMediaFor*()` / `getUsernameForPost()`.
 *
 * The four reference-parity caches (id_to_username_map, user_profile_pic_url,
 * stories_reels_media, reels_edges_data) carry our internal projection of
 * Instagram's API responses. `ingestXhrSnapshot` populates them from live
 * XHR captures.
 */

/** Flat map: Instagram post id → author username. Populated from intercepted feed/post GraphQL responses. */
export type IdToUsernameMap = Record<string, string>;

/** Flat map: username → avatar image URL. Populated from user_profile XHR snapshots. */
export type UserProfilePicUrl = Record<string, string>;

/** Per-story/reel item. Keyed by story/reel id inside `StoriesReelsMedia`. */
export interface StoriesReelsItem {
  id: string;
  username: string;
  url: string;
  isVideo: boolean;
  extension: string;
}
export type StoriesReelsMedia = Record<string, StoriesReelsItem>;

/** Reels GraphQL edge entry. Keyed by reel id inside `ReelsEdgesData`. */
export interface ReelsEdgeEntry {
  id: string;
  username: string;
  url: string;
  extension: string;
  /** Reels can be video or image (cover); downstream consumers need both cases. */
  isVideo: boolean;
}
export type ReelsEdgesData = Record<string, ReelsEdgeEntry>;

/** A single item inside a post carousel or Threads media bundle. */
export interface CarouselItem {
  url: string;
  extension: string;
  isVideo: boolean;
}

/** Post carousel entry — keyed by post id inside `PostMedia`. `items.length >= 1`. */
export interface PostMediaEntry {
  id: string;
  username: string;
  items: CarouselItem[];
}
export type PostMedia = Record<string, PostMediaEntry>;

/** Highlights entry — keyed by highlight id. Similar shape to `StoriesReelsItem` but versioned separately. */
export interface HighlightEntry {
  id: string;
  username: string;
  url: string;
  isVideo: boolean;
  extension: string;
}
export type HighlightMedia = Record<string, HighlightEntry>;

/** Threads post entry — populated via the `externally_connectable` bridge. */
export interface ThreadsPostEntry {
  id: string;
  username: string;
  items: CarouselItem[];
}
export type ThreadsPostMedia = Record<string, ThreadsPostEntry>;
