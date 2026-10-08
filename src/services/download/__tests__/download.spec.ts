import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asMessage, routeMessage } from "../../../background/shared/router";
import type { MediaResource } from "../../../types/instagram";
import { createMediaCacheService } from "../../media-cache/media-cache";
import { createSettingsService } from "../../settings/settings";
import { inMemoryStorage } from "../../settings/storage";
import { createDownloadService } from "../download";

/**
 * End-to-end over the message bus: `DownloadService.queue` in the content
 * script → `chrome.runtime.sendMessage` → the background router →
 * `handleDownloadMedia`. The stubbed transport serializes both directions the
 * way the real one does, so anything that can't cross the boundary fails here.
 */

const reel: MediaResource = {
  url: "https://cdn.example.com/standard-720p.mp4",
  id: "REEL1",
  type: "reel",
  username: "alice",
  extension: "mp4",
  isVideo: true,
};
const vp9 = {
  videoUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/vp9-1080p.mp4",
  audioUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/aac.mp4",
};

/** Wires the content-script service to the background handlers. VP9 is on unless a test says otherwise. */
async function wire({ preferVp9Reels = true } = {}) {
  const storage = inMemoryStorage();
  const remux = {
    build: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" })),
  };
  const deps = {
    settings: createSettingsService({ storage }),
    mediaCache: createMediaCacheService({ storage }),
    remux,
  };
  await deps.settings.patch({ preferVp9Reels });
  const download = vi.fn(async () => 5);
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-ext",
      sendMessage: async (raw: unknown) => {
        const message = asMessage(JSON.parse(JSON.stringify(raw)));
        if (!message) return { ok: false, error: "malformed message" };
        return JSON.parse(JSON.stringify(await routeMessage(message, deps)));
      },
    },
    downloads: { download },
  });
  return { remux, download };
}

// As in Chrome's service worker, there is no URL.createObjectURL.
const nativeCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  Object.assign(URL, { createObjectURL: undefined });
});

afterEach(() => {
  Object.assign(URL, { createObjectURL: nativeCreateObjectURL });
  vi.unstubAllGlobals();
});

describe("DownloadService.queue — across the message bus", () => {
  it("queues a plain resource and returns its download id", async () => {
    const { download, remux } = await wire();

    const result = await createDownloadService().queue(reel);

    expect(result).toEqual({ ok: true, downloadId: 5 });
    expect(remux.build).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ url: reel.url }));
  });

  it("carries a VP9 rendition to the background and reports that VP9 was downloaded", async () => {
    const { download, remux } = await wire();

    const result = await createDownloadService().queue({ ...reel, vp9 });

    expect(remux.build).toHaveBeenCalledWith(vp9);
    expect(result).toEqual({ ok: true, downloadId: 5, usedVp9: true });
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "data:video/mp4;base64,AQID" }),
    );
  });

  it("downloads the standard video, with nothing to report, when the user's VP9 setting is off", async () => {
    // A content script with a stale settings cache still attaches the rendition.
    const { download, remux } = await wire({ preferVp9Reels: false });

    const result = await createDownloadService().queue({ ...reel, vp9 });

    expect(remux.build).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, downloadId: 5 });
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ url: reel.url }));
  });

  it("reports the standard-video fallback when the background's remux fails", async () => {
    const { download, remux } = await wire();
    remux.build.mockRejectedValueOnce(new Error("RemuxService.build: fetch returned 403"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await createDownloadService().queue({ ...reel, vp9 });

    expect(result).toEqual({ ok: true, downloadId: 5, usedVp9: false });
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ url: reel.url }));
  });

  it("passes saveAs through and surfaces a rejected download as { ok: false }", async () => {
    const { download } = await wire();
    download.mockRejectedValueOnce(new Error("Download canceled by the user"));

    const result = await createDownloadService().queue({ ...reel, vp9 }, { saveAs: true });

    expect(download).toHaveBeenCalledWith(expect.objectContaining({ saveAs: true }));
    expect(result).toEqual({ ok: false, error: "Download canceled by the user" });
  });

  it("flags a request the background never answered, so the caller can tell it from a handler error", async () => {
    await wire();
    chrome.runtime.sendMessage = (async () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    }) as unknown as typeof chrome.runtime.sendMessage;

    const result = await createDownloadService().queue({ ...reel, vp9 });

    expect(result).toEqual({
      ok: false,
      error: "Could not establish connection. Receiving end does not exist.",
      transport: true,
    });
  });
});
