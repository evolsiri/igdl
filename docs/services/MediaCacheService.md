# MediaCacheService

Owns the ephemeral caches that store Instagram + Threads API responses captured by the XHR-interception layer. Content-script handlers read through the public resolver API to turn a DOM-extracted id (post id, reel id, username) into a list of `MediaResource` objects ready to hand to `DownloadService`.

The raw-cache helpers are module-private; handlers use the resolver API only (TAC-4.7).

## Files

| Path | Role |
|---|---|
| `src/services/MediaCacheService/index.ts` | Public resolver API + ingestion entry point + lifecycle. |
| `src/services/MediaCacheService/keys.ts` | Cache-key constants + `ALL_CACHE_KEYS`. |
| `src/types/media-cache.ts` | Cache-payload shapes. |
| `src/types/instagram.ts` | `MediaResource` + `MediaType`. |

## Public API

### Resolver methods

Every `resolveMediaFor*` method is async, safe to call on an empty cache (returns `[]` or `null`), and tolerates malformed payloads (never throws).

```ts
resolveMediaForPost(postId: string): Promise<MediaResource[]>
resolveMediaForReel(reelId: string): Promise<MediaResource[]>
resolveMediaForStory(storyId: string): Promise<MediaResource[]>
resolveMediaForHighlight(highlightId: string): Promise<MediaResource[]>
resolveMediaForAvatar(username: string): Promise<MediaResource | null>
resolveMediaForThreadsPost(postId: string): Promise<MediaResource[]>
```

Carousels (post + Threads) return N resources with 1-based `index`. Single-item surfaces return a 1-element array with `index` undefined. Reels fall back from `reels_edges_data` to `stories_reels_media` when absent from the primary cache.

```ts
const items = await cache.resolveMediaForPost("ABC123");
// → [{ url, id: "ABC123", type: "post", username: "alice", index: 1, extension: "jpg", isVideo: false }, ...]
```

### `getUsernameForPost(postId): Promise<string | null>`

Single source of truth for post-id → author-username mapping (PLAN round 7 decision 30). The feed-click handler uses this to figure out which profile authored a post before routing to per-profile directories.

Populated by `ingestXhrSnapshot` off intercepted feed/timeline responses.

### `ingestXhrSnapshot(endpoint, body): Promise<void>`

Single entry point for cache writes from the XHR-interception layer (TAC-5.5). Dispatches on endpoint substring into the matching cache key. Unknown endpoints are a silent no-op (Instagram emits many we don't care about).

Wired parsers:
- `/api/v1/users/web_profile_info/` → `user_profile_pic_url`
- `/api/v1/feed/timeline/` → `id_to_username_map`

Additional parsers are added as new endpoints are observed in live traffic.

### `clearAll(): Promise<void>`

Removes every key this service owns (7 keys). Called from the background on `chrome.runtime.onStartup` — caches are ephemeral (TAC-5.4).

## Cache keys

All keys prefixed with `igdl_cache_`:

| Key constant | Shape | Populated by |
|---|---|---|
| `idToUsernameMap` | `Record<postId, username>` | feed/timeline, post-detail GraphQL |
| `userProfilePicUrl` | `Record<username, url>` | web_profile_info |
| `storiesReelsMedia` | `Record<id, StoriesReelsItem>` | stories tray |
| `reelsEdgesData` | `Record<reelId, ReelsEdgeEntry>` | reels GraphQL |
| `postMedia` | `Record<postId, PostMediaEntry>` | post detail / feed carousels |
| `highlightMedia` | `Record<highlightId, HighlightEntry>` | highlight viewer |
| `threadsPostMedia` | `Record<postId, ThreadsPostEntry>` | threads.com external bridge |

## Consumers

- Content-script handlers (`src/content/handlers/*`): resolver API + `getUsernameForPost` for feed clicks.
- Background Threads bridge (`src/background/shared/threads.ts`): calls `ingestXhrSnapshot` on every external message.
- Background lifecycle (`src/background/shared/register.ts`): calls `clearAll` on startup.

## Tests

`tests/services/MediaCacheService.test.ts` — 36 cases. Per resolver: cache hit, cache miss, malformed payload. Ingestion dispatch for each supported endpoint. `clearAll` scoping + idempotency.

Seed `inMemoryStorage()` directly with the cache-key shape to set up a hit-path test. The service's resolver methods don't care how data got into storage — they only read.
