# MediaCacheService

Ephemeral cache of Instagram + Threads API payloads observed by the XHR-interception layer. Resolves a DOM-derived id (post id, reel id, username, highlight pk) into the `MediaResource[]` content-script handlers hand to `DownloadService`.

This service exists because most Instagram media URLs (especially video) are **short-lived signed URLs** that never enter the DOM. To get reliable URLs without re-issuing API calls on every click, the inject script captures responses live; this service is the read side of that pipeline.

## Public API

```ts
interface MediaCacheService {
  resolveMediaForPost(postId: string): Promise<MediaResource[]>;
  resolveMediaForReel(reelId: string): Promise<MediaResource[]>;
  resolveMediaForStory(storyId: string): Promise<MediaResource[]>;
  resolveMediaForHighlight(highlightPk: string): Promise<MediaResource[]>;
  resolveMediaForAvatar(username: string): Promise<MediaResource | null>;
  resolveMediaForThreadsPost(postId: string): Promise<MediaResource[]>;
  getUsernameForPost(postId: string): Promise<string | null>;
  ingestXhrSnapshot(endpoint: string, body: unknown): Promise<void>;
  clearAll(): Promise<void>;
}

function createMediaCacheService(options?: MediaCacheServiceOptions): MediaCacheService;
```

The `resolveMediaForX` methods all return `[]` (or `null` for avatar) on cache miss and **never throw** — handlers fall back to `getDataFromAPI()` when the cache hasn't seen the relevant payload yet. Carousels return one `MediaResource` per item; non-carousels return one-element arrays.

`getUsernameForPost()` is the feed-click handler's single source of truth for who authored a post. It's populated from intercepted `/api/v1/feed/timeline/` responses.

`ingestXhrSnapshot()` is the only write entry point. It dispatches by endpoint substring:

| Endpoint match | Cache key updated |
| --- | --- |
| `/api/v1/users/web_profile_info/` | `userProfilePicUrl` |
| `/api/v1/feed/timeline/` | `idToUsernameMap` |
| `/graphql/query` (highlights connection) | `highlightMedia` |

Unknown endpoints are silently ignored — Instagram emits dozens of endpoints we don't care about.

## Lifecycle

Singleton-per-context (created once in `src/background/chrome.ts` / `firefox.ts`). Lazy: no listeners on construction. The background's `chrome.runtime.onStartup` fires `clearAll()` so caches don't leak across browser sessions.

## Storage

Backed by `chrome.storage.local` via the `KvStorage` adapter from `src/services/settings/storage.ts`. The cache keys are listed in `src/services/media-cache/keys.ts:CACHE_KEYS` and exported as `ALL_CACHE_KEYS` for `clearAll()`.

## Call sites

- `src/background/shared/router.ts` — handles `XHR_SNAPSHOT` messages by calling `ingestXhrSnapshot`.
- `src/background/shared/register.ts` — calls `clearAll()` on `chrome.runtime.onStartup`.
- `src/background/shared/threads.ts` — Threads bridge writes `THREADS_MEDIA` payloads here.
- Content-script handlers (`handlers/post.ts`, `handlers/highlights.ts`, etc.) — call `resolveMediaForX` to skip the API roundtrip when the cache has the data.

## Invariants

- All writes flow through `ingestXhrSnapshot` (or the Threads bridge equivalent). Adding a new endpoint means adding a new dispatch branch and a parser, not a new write site.
- Parsers tolerate shape drift: missing fields, unknown keys, malformed nodes are skipped, not thrown over.
- `clearAll()` deletes every key in `ALL_CACHE_KEYS` — extending the cache means adding to `CACHE_KEYS` so `clearAll` stays exhaustive.
