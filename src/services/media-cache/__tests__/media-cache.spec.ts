import { describe, expect, it } from "vitest";
import {
  createMediaCacheService,
  type MediaCacheService,
} from "../media-cache";
import { ALL_CACHE_KEYS, CACHE_KEYS } from "../keys";
import {
  inMemoryStorage,
  type KvStorage,
} from "../../settings/storage";

function setup(seed: Record<string, unknown> = {}): {
  cache: MediaCacheService;
  storage: KvStorage;
} {
  const storage = inMemoryStorage(seed);
  return { cache: createMediaCacheService({ storage }), storage };
}

describe("MediaCacheService", () => {
  describe("getUsernameForPost()", () => {
    it("returns the cached username", async () => {
      const { cache } = setup({
        [CACHE_KEYS.idToUsernameMap]: { ABC123: "alice" },
      });
      expect(await cache.getUsernameForPost("ABC123")).toBe("alice");
    });

    it("returns null on cache miss", async () => {
      const { cache } = setup();
      expect(await cache.getUsernameForPost("ABC123")).toBeNull();
    });

    it("returns null when the map is malformed", async () => {
      const { cache } = setup({ [CACHE_KEYS.idToUsernameMap]: "garbage" });
      expect(await cache.getUsernameForPost("ABC123")).toBeNull();
    });

    it("returns null when value for id is not a string", async () => {
      const { cache } = setup({
        [CACHE_KEYS.idToUsernameMap]: { ABC123: 42 },
      });
      expect(await cache.getUsernameForPost("ABC123")).toBeNull();
    });
  });

  describe("resolveMediaForAvatar()", () => {
    it("returns a MediaResource with type=avatar and extension derived from URL", async () => {
      const { cache } = setup({
        [CACHE_KEYS.userProfilePicUrl]: {
          alice: "https://example.com/alice.jpg?sig=abc",
        },
      });
      const result = await cache.resolveMediaForAvatar("alice");
      expect(result).toEqual({
        url: "https://example.com/alice.jpg?sig=abc",
        id: "alice",
        type: "avatar",
        username: "alice",
        extension: "jpg",
        isVideo: false,
      });
    });

    it("falls back to 'jpg' extension when URL has none", async () => {
      const { cache } = setup({
        [CACHE_KEYS.userProfilePicUrl]: {
          alice: "https://example.com/alice",
        },
      });
      const result = await cache.resolveMediaForAvatar("alice");
      expect(result?.extension).toBe("jpg");
    });

    it("returns null on cache miss", async () => {
      const { cache } = setup();
      expect(await cache.resolveMediaForAvatar("alice")).toBeNull();
    });

    it("returns null when the map is malformed", async () => {
      const { cache } = setup({ [CACHE_KEYS.userProfilePicUrl]: "garbage" });
      expect(await cache.resolveMediaForAvatar("alice")).toBeNull();
    });
  });

  describe("resolveMediaForPost()", () => {
    it("returns one resource for a single-item post with no index", async () => {
      const { cache } = setup({
        [CACHE_KEYS.postMedia]: {
          ABC123: {
            id: "ABC123",
            username: "alice",
            items: [{ url: "https://example.com/ABC123.jpg", extension: "jpg", isVideo: false }],
          },
        },
      });
      const [only] = await cache.resolveMediaForPost("ABC123");
      expect(only).toMatchObject({
        id: "ABC123",
        type: "post",
        username: "alice",
        extension: "jpg",
        isVideo: false,
      });
      expect(only.index).toBeUndefined();
    });

    it("assigns 1-based index on carousels", async () => {
      const { cache } = setup({
        [CACHE_KEYS.postMedia]: {
          ABC123: {
            id: "ABC123",
            username: "alice",
            items: [
              { url: "https://example.com/a.jpg", extension: "jpg", isVideo: false },
              { url: "https://example.com/b.mp4", extension: "mp4", isVideo: true },
              { url: "https://example.com/c.jpg", extension: "jpg", isVideo: false },
            ],
          },
        },
      });
      const items = await cache.resolveMediaForPost("ABC123");
      expect(items.map((m) => m.index)).toEqual([1, 2, 3]);
      expect(items[1].isVideo).toBe(true);
    });

    it("returns [] on cache miss", async () => {
      const { cache } = setup();
      expect(await cache.resolveMediaForPost("ABC123")).toEqual([]);
    });

    it("returns [] when entry has no items", async () => {
      const { cache } = setup({
        [CACHE_KEYS.postMedia]: { ABC123: { id: "ABC123", username: "alice", items: [] } },
      });
      expect(await cache.resolveMediaForPost("ABC123")).toEqual([]);
    });

    it("returns [] when entry is malformed", async () => {
      const { cache } = setup({ [CACHE_KEYS.postMedia]: { ABC123: "garbage" } });
      expect(await cache.resolveMediaForPost("ABC123")).toEqual([]);
    });
  });

  describe("resolveMediaForReel()", () => {
    it("reads from reels_edges_data when available", async () => {
      const { cache } = setup({
        [CACHE_KEYS.reelsEdgesData]: {
          REEL1: {
            id: "REEL1",
            username: "bob",
            url: "https://example.com/reel1.mp4",
            extension: "mp4",
            isVideo: true,
          },
        },
      });
      const [only] = await cache.resolveMediaForReel("REEL1");
      expect(only).toMatchObject({ id: "REEL1", type: "reel", username: "bob", isVideo: true });
    });

    it("falls back to stories_reels_media", async () => {
      const { cache } = setup({
        [CACHE_KEYS.storiesReelsMedia]: {
          REEL2: {
            id: "REEL2",
            username: "carol",
            url: "https://example.com/reel2.mp4",
            isVideo: true,
            extension: "mp4",
          },
        },
      });
      const [only] = await cache.resolveMediaForReel("REEL2");
      expect(only.username).toBe("carol");
    });

    it("prefers reels_edges_data over stories_reels_media when both exist", async () => {
      const { cache } = setup({
        [CACHE_KEYS.reelsEdgesData]: {
          REEL3: { id: "REEL3", username: "via-edges", url: "https://x/edges.mp4", extension: "mp4", isVideo: true },
        },
        [CACHE_KEYS.storiesReelsMedia]: {
          REEL3: { id: "REEL3", username: "via-stories", url: "https://x/stories.mp4", isVideo: true, extension: "mp4" },
        },
      });
      const [only] = await cache.resolveMediaForReel("REEL3");
      expect(only.username).toBe("via-edges");
    });

    it("returns [] when neither cache has the reel", async () => {
      const { cache } = setup();
      expect(await cache.resolveMediaForReel("nope")).toEqual([]);
    });
  });

  describe("resolveMediaForStory()", () => {
    it("returns one MediaResource with type=story", async () => {
      const { cache } = setup({
        [CACHE_KEYS.storiesReelsMedia]: {
          STORY1: {
            id: "STORY1",
            username: "dave",
            url: "https://example.com/s1.jpg",
            isVideo: false,
            extension: "jpg",
          },
        },
      });
      const items = await cache.resolveMediaForStory("STORY1");
      expect(items).toEqual([
        {
          url: "https://example.com/s1.jpg",
          id: "STORY1",
          type: "story",
          username: "dave",
          extension: "jpg",
          isVideo: false,
        },
      ]);
    });

    it("returns [] on cache miss", async () => {
      const { cache } = setup();
      expect(await cache.resolveMediaForStory("nope")).toEqual([]);
    });
  });

  describe("resolveMediaForHighlight()", () => {
    it("returns one MediaResource per item with type=highlight", async () => {
      const { cache } = setup({
        [CACHE_KEYS.highlightMedia]: {
          "18023929": {
            id: "highlight:18023929",
            username: "eve",
            items: [
              { takenAt: 1700000000, url: "https://example.com/h1.mp4", isVideo: true, extension: "mp4" },
              { takenAt: 1700000100, url: "https://example.com/h2.jpg", isVideo: false, extension: "jpg" },
            ],
          },
        },
      });
      const items = await cache.resolveMediaForHighlight("18023929");
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        type: "highlight",
        username: "eve",
        id: "highlight:18023929",
        isVideo: true,
        index: 1,
        url: "https://example.com/h1.mp4",
      });
      expect(items[1].index).toBe(2);
      expect(items[1].isVideo).toBe(false);
    });

    it("omits the index when the reel has only one item", async () => {
      const { cache } = setup({
        [CACHE_KEYS.highlightMedia]: {
          "18023929": {
            id: "highlight:18023929",
            username: "eve",
            items: [{ takenAt: 0, url: "https://example.com/h1.jpg", isVideo: false, extension: "jpg" }],
          },
        },
      });
      const [only] = await cache.resolveMediaForHighlight("18023929");
      expect(only.index).toBeUndefined();
    });

    it("returns [] on cache miss", async () => {
      const { cache } = setup();
      expect(await cache.resolveMediaForHighlight("nope")).toEqual([]);
    });

    it("returns [] for an empty items array", async () => {
      const { cache } = setup({
        [CACHE_KEYS.highlightMedia]: {
          "18023929": { id: "highlight:18023929", username: "eve", items: [] },
        },
      });
      expect(await cache.resolveMediaForHighlight("18023929")).toEqual([]);
    });
  });

  describe("resolveMediaForThreadsPost()", () => {
    it("returns carousel-indexed resources for Threads posts", async () => {
      const { cache } = setup({
        [CACHE_KEYS.threadsPostMedia]: {
          THRD1: {
            id: "THRD1",
            username: "frank",
            items: [
              { url: "https://t.example/a.jpg", extension: "jpg", isVideo: false },
              { url: "https://t.example/b.mp4", extension: "mp4", isVideo: true },
            ],
          },
        },
      });
      const items = await cache.resolveMediaForThreadsPost("THRD1");
      expect(items).toHaveLength(2);
      expect(items[0].type).toBe("threads");
      expect(items.map((m) => m.index)).toEqual([1, 2]);
    });

    it("returns [] on cache miss", async () => {
      const { cache } = setup();
      expect(await cache.resolveMediaForThreadsPost("nope")).toEqual([]);
    });
  });

  describe("ingestXhrSnapshot()", () => {
    it("web_profile_info → user_profile_pic_url", async () => {
      const { cache, storage } = setup();
      await cache.ingestXhrSnapshot("/api/v1/users/web_profile_info/?username=alice", {
        data: {
          user: {
            username: "alice",
            profile_pic_url_hd: "https://cdn.example/alice.jpg",
          },
        },
      });
      const stored = await storage.get<Record<string, string>>(CACHE_KEYS.userProfilePicUrl);
      expect(stored?.alice).toBe("https://cdn.example/alice.jpg");
    });

    it("prefers profile_pic_url_hd but falls back to profile_pic_url", async () => {
      const { cache, storage } = setup();
      await cache.ingestXhrSnapshot("/api/v1/users/web_profile_info/", {
        user: { username: "bob", profile_pic_url: "https://cdn.example/bob.jpg" },
      });
      const stored = await storage.get<Record<string, string>>(CACHE_KEYS.userProfilePicUrl);
      expect(stored?.bob).toBe("https://cdn.example/bob.jpg");
    });

    it("feed/timeline → id_to_username_map (top-level items)", async () => {
      const { cache, storage } = setup();
      await cache.ingestXhrSnapshot("/api/v1/feed/timeline/", {
        items: [
          { id: "P1", user: { username: "alice" } },
          { id: "P2", user: { username: "bob" } },
        ],
      });
      const stored = await storage.get<Record<string, string>>(CACHE_KEYS.idToUsernameMap);
      expect(stored).toEqual({ P1: "alice", P2: "bob" });
    });

    it("feed/timeline → accumulates across calls", async () => {
      const { cache, storage } = setup({
        [CACHE_KEYS.idToUsernameMap]: { OLD: "carol" },
      });
      await cache.ingestXhrSnapshot("/api/v1/feed/timeline/", {
        items: [{ id: "NEW", user: { username: "dave" } }],
      });
      const stored = await storage.get<Record<string, string>>(CACHE_KEYS.idToUsernameMap);
      expect(stored).toEqual({ OLD: "carol", NEW: "dave" });
    });

    it("ignores unknown endpoints silently", async () => {
      const { cache, storage } = setup();
      await cache.ingestXhrSnapshot("/some/other/endpoint", { items: [] });
      for (const key of ALL_CACHE_KEYS) {
        expect(await storage.get(key)).toBeUndefined();
      }
    });

    it("ignores non-object bodies", async () => {
      const { cache, storage } = setup();
      await cache.ingestXhrSnapshot("/api/v1/feed/timeline/", "garbage");
      expect(await storage.get(CACHE_KEYS.idToUsernameMap)).toBeUndefined();
    });

    it("doesn't throw on malformed web_profile_info body", async () => {
      const { cache } = setup();
      await expect(
        cache.ingestXhrSnapshot("/api/v1/users/web_profile_info/", {}),
      ).resolves.toBeUndefined();
    });

    describe("graphql/query → highlight_media", () => {
      const TRAVEL_BODY = {
        data: {
          xdt_api__v1__feed__reels_media__connection: {
            edges: [
              {
                node: {
                  id: "highlight:1111",
                  user: { username: "alice" },
                  items: [
                    {
                      taken_at: 1700000000,
                      image_versions2: { candidates: [{ url: "https://cdn/travel-1.jpg" }] },
                    },
                    {
                      taken_at: 1700000050,
                      video_versions: [{ url: "https://cdn/travel-2.mp4" }],
                      image_versions2: { candidates: [{ url: "https://cdn/travel-2-poster.jpg" }] },
                    },
                  ],
                },
              },
              {
                node: {
                  id: "highlight:2222",
                  user: { username: "alice" },
                  items: [
                    {
                      taken_at: 1700000100,
                      image_versions2: { candidates: [{ url: "https://cdn/food-1.jpg" }] },
                    },
                  ],
                },
              },
            ],
          },
        },
      };

      it("writes one entry per edge keyed by unprefixed pk", async () => {
        const { cache, storage } = setup();
        await cache.ingestXhrSnapshot("https://www.instagram.com/graphql/query", TRAVEL_BODY);
        const stored = await storage.get<Record<string, unknown>>(CACHE_KEYS.highlightMedia);
        expect(stored && Object.keys(stored).sort()).toEqual(["1111", "2222"]);
      });

      it("merges with existing reels rather than overwriting them", async () => {
        const { cache, storage } = setup({
          [CACHE_KEYS.highlightMedia]: {
            "9999": {
              id: "highlight:9999",
              username: "carol",
              items: [{ takenAt: 0, url: "https://cdn/old.jpg", isVideo: false, extension: "jpg" }],
            },
          },
        });
        await cache.ingestXhrSnapshot("/graphql/query", TRAVEL_BODY);
        const stored = await storage.get<Record<string, unknown>>(CACHE_KEYS.highlightMedia);
        expect(stored && Object.keys(stored).sort()).toEqual(["1111", "2222", "9999"]);
      });

      it("picks video URL over image when both are present and marks isVideo", async () => {
        const { cache } = setup();
        await cache.ingestXhrSnapshot("/graphql/query", TRAVEL_BODY);
        const items = await cache.resolveMediaForHighlight("1111");
        expect(items[1]).toMatchObject({
          url: "https://cdn/travel-2.mp4",
          isVideo: true,
          extension: "mp4",
        });
        expect(items[0]).toMatchObject({
          url: "https://cdn/travel-1.jpg",
          isVideo: false,
          extension: "jpg",
        });
      });

      it("downstream resolver returns the SECOND reel's items when queried by its pk", async () => {
        const { cache } = setup();
        await cache.ingestXhrSnapshot("/graphql/query", TRAVEL_BODY);
        const items = await cache.resolveMediaForHighlight("2222");
        expect(items).toHaveLength(1);
        expect(items[0].url).toBe("https://cdn/food-1.jpg");
        expect(items[0].id).toBe("highlight:2222");
      });

      it("skips edges with empty items, missing username, or unresolvable URLs", async () => {
        const { cache, storage } = setup();
        await cache.ingestXhrSnapshot("/graphql/query", {
          data: {
            xdt_api__v1__feed__reels_media__connection: {
              edges: [
                { node: { id: "highlight:empty", user: { username: "x" }, items: [] } },
                { node: { id: "highlight:nouser", items: [{ taken_at: 0, image_versions2: { candidates: [{ url: "u" }] } }] } },
                { node: { id: "highlight:nourl", user: { username: "y" }, items: [{ taken_at: 0, image_versions2: { candidates: [] } }] } },
              ],
            },
          },
        });
        expect(await storage.get(CACHE_KEYS.highlightMedia)).toBeUndefined();
      });

      it("locates the connection nested under arbitrary parent keys", async () => {
        const { cache } = setup();
        await cache.ingestXhrSnapshot("/graphql/query", {
          some: {
            deeply: {
              nested: {
                xdt_api__v1__feed__reels_media__connection: {
                  edges: [
                    {
                      node: {
                        id: "highlight:nested",
                        user: { username: "alice" },
                        items: [
                          { taken_at: 1, image_versions2: { candidates: [{ url: "https://cdn/n.jpg" }] } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        });
        const items = await cache.resolveMediaForHighlight("nested");
        expect(items).toHaveLength(1);
        expect(items[0].url).toBe("https://cdn/n.jpg");
      });

      it("ignores graphql/query bodies that don't carry the highlights connection", async () => {
        const { cache, storage } = setup();
        await cache.ingestXhrSnapshot("/graphql/query", { data: { something_else: { edges: [] } } });
        expect(await storage.get(CACHE_KEYS.highlightMedia)).toBeUndefined();
      });

      it("tolerates ids without the 'highlight:' prefix", async () => {
        const { cache, storage } = setup();
        await cache.ingestXhrSnapshot("/graphql/query", {
          data: {
            xdt_api__v1__feed__reels_media__connection: {
              edges: [
                {
                  node: {
                    id: "3333",
                    user: { username: "alice" },
                    items: [
                      { taken_at: 1, image_versions2: { candidates: [{ url: "https://cdn/p.jpg" }] } },
                    ],
                  },
                },
              ],
            },
          },
        });
        const stored = await storage.get<Record<string, unknown>>(CACHE_KEYS.highlightMedia);
        expect(stored && Object.keys(stored)).toEqual(["3333"]);
      });
    });
  });

  describe("clearAll()", () => {
    it("removes every cache key and leaves non-cache keys alone", async () => {
      const { cache, storage } = setup({
        [CACHE_KEYS.idToUsernameMap]: { A: "a" },
        [CACHE_KEYS.userProfilePicUrl]: { a: "https://x/a.jpg" },
        igdl_settings: { schemaVersion: 1 },
      });
      await cache.clearAll();
      for (const key of ALL_CACHE_KEYS) {
        expect(await storage.get(key)).toBeUndefined();
      }
      expect(await storage.get("igdl_settings")).toEqual({ schemaVersion: 1 });
    });

    it("is idempotent", async () => {
      const { cache } = setup();
      await cache.clearAll();
      await expect(cache.clearAll()).resolves.toBeUndefined();
    });
  });
});
