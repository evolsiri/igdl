import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asMessage, routeMessage } from "../router";
import { createMediaCacheService } from "../../../services/media-cache/media-cache";
import { createSettingsService } from "../../../services/settings/settings";
import { inMemoryStorage } from "../../../services/settings/storage";

function setup() {
  const storage = inMemoryStorage();
  return {
    deps: {
      settings: createSettingsService({ storage }),
      mediaCache: createMediaCacheService({ storage }),
      remux: { build: vi.fn(async () => new Blob(["remuxed"], { type: "video/mp4" })) },
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

  it.each(["OPEN_URL", "XHR_SNAPSHOT"])(
    "accepts %s as a known type",
    (type) => {
      expect(asMessage({ type })).not.toBeNull();
    },
  );

  it("returns null for the retired ZIP_BUILD type", () => {
    // Zip assembly moved fully into the content script, so ZIP_BUILD is no
    // longer a cross-context message. Regression guard: senders that still
    // post it must get the same "unknown type" treatment as any other
    // garbage payload.
    expect(asMessage({ type: "ZIP_BUILD" })).toBeNull();
  });

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
      downloads: {
        download: vi.fn(async () => 42),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
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

  it("carries a VP9 rendition through DOWNLOAD_MEDIA and reports which video was downloaded", async () => {
    const { deps } = setup();
    await deps.settings.patch({ preferVp9Reels: true });
    const vp9 = {
      videoUrl: "https://scontent.cdninstagram.com/o1/v/vp9.mp4",
      audioUrl: "https://scontent.cdninstagram.com/o1/v/aac.mp4",
    };
    const raw = {
      type: "DOWNLOAD_MEDIA",
      resource: {
        url: "https://example.com/standard.mp4",
        id: "REEL1",
        type: "reel",
        username: "alice",
        extension: "mp4",
        isVideo: true,
        vp9,
      },
    };
    const message = asMessage(raw);
    expect(message).not.toBeNull();

    const response = await routeMessage(message!, deps);

    expect(deps.remux.build).toHaveBeenCalledWith(vp9);
    expect(response).toEqual({ ok: true, data: { downloadId: 42, usedVp9: true } });
    // The remuxed file, not the standard video — as a data: or blob: URL
    // depending on what the runtime can mint.
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/^(data|blob):/) }),
    );
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

});
