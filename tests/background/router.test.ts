import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asMessage, routeMessage } from "../../src/background/shared/router";
import { createMediaCacheService } from "../../src/services/MediaCacheService";
import { createSettingsService } from "../../src/services/SettingsService";
import { inMemoryStorage } from "../../src/services/SettingsService/storage";

function setup() {
  const storage = inMemoryStorage();
  return {
    deps: {
      settings: createSettingsService({ storage }),
      mediaCache: createMediaCacheService({ storage }),
    },
    storage,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asMessage()", () => {
  it("narrows a well-formed DOWNLOAD_MEDIA payload", () => {
    const raw = { type: "DOWNLOAD_MEDIA", resource: {} };
    expect(asMessage(raw)).toBe(raw);
  });

  it.each(["OPEN_URL", "XHR_SNAPSHOT", "ZIP_BUILD"])(
    "accepts %s as a known type",
    (type) => {
      expect(asMessage({ type })).not.toBeNull();
    },
  );

  it("returns null for unknown types", () => {
    expect(asMessage({ type: "NOT_A_THING" })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(asMessage(null)).toBeNull();
    expect(asMessage("string")).toBeNull();
    expect(asMessage(42)).toBeNull();
  });

  it("returns null when type field is missing or not a string", () => {
    expect(asMessage({})).toBeNull();
    expect(asMessage({ type: 123 })).toBeNull();
  });
});

describe("routeMessage()", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test-ext" },
      downloads: { download: vi.fn(async () => 42) },
      tabs: { create: vi.fn(async () => ({ id: 99 })) },
    });
  });

  it("dispatches DOWNLOAD_MEDIA to the downloads handler", async () => {
    const { deps } = setup();
    const response = await routeMessage(
      {
        type: "DOWNLOAD_MEDIA",
        resource: {
          url: "https://example.com/x.jpg",
          id: "ABC",
          type: "post",
          username: "alice",
          extension: "jpg",
          isVideo: false,
        },
      },
      deps,
    );
    expect(response).toEqual({ ok: true, data: { downloadId: 42 } });
  });

  it("dispatches OPEN_URL to the open-url handler", async () => {
    const { deps } = setup();
    const response = await routeMessage(
      { type: "OPEN_URL", url: "https://example.com" },
      deps,
    );
    expect(response).toEqual({ ok: true, data: { tabId: 99 } });
  });

  it("dispatches XHR_SNAPSHOT into MediaCacheService.ingestXhrSnapshot", async () => {
    const { deps, storage } = setup();
    const response = await routeMessage(
      {
        type: "XHR_SNAPSHOT",
        endpoint: "/api/v1/users/web_profile_info/",
        body: { user: { username: "alice", profile_pic_url_hd: "https://x/a.jpg" } },
      },
      deps,
    );
    expect(response.ok).toBe(true);
    const cache = await storage.get<Record<string, string>>(
      "igdl_cache_user_profile_pic_url",
    );
    expect(cache?.alice).toBe("https://x/a.jpg");
  });

  it("returns an error response for ZIP_BUILD (no Chrome handler)", async () => {
    const { deps } = setup();
    const response = await routeMessage(
      { type: "ZIP_BUILD", items: [], outFilename: "x.zip" },
      deps,
    );
    expect(response.ok).toBe(false);
  });
});
