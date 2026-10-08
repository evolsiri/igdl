import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleDownloadMedia, handleDownloadZip } from "../downloads";
import { createMediaCacheService } from "../../../services/media-cache/media-cache";
import { remuxToMp4 } from "../../../services/remux/mp4";
import { createRemuxService } from "../../../services/remux/remux";
import {
  AAC_AUDIO_STREAM,
  VP9_VIDEO_STREAM,
} from "../../../services/remux/__tests__/fixtures";
import { createSettingsService } from "../../../services/settings/settings";
import { inMemoryStorage } from "../../../services/settings/storage";

function setup() {
  const storage = inMemoryStorage();
  const remux = {
    build: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" })),
  };
  return {
    storage,
    remux,
    deps: {
      settings: createSettingsService({ storage }),
      mediaCache: createMediaCacheService({ storage }),
      remux,
    },
  };
}

/** `setup()` for a user who has turned "Download reels in VP9" on. */
async function setupWithVp9() {
  const context = setup();
  await context.deps.settings.patch({ preferVp9Reels: true });
  return context;
}

const VP9 = {
  videoUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/vp9-1080p.mp4?efg=1",
  audioUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/aac.mp4?efg=1",
};

/** A reel download with no VP9 rendition attached — the setting-off shape. */
function standardReelMessage() {
  const { vp9: _vp9, ...resource } = reelMessage().resource;
  return { type: "DOWNLOAD_MEDIA" as const, resource };
}

function reelMessage(vp9: unknown = VP9) {
  return {
    type: "DOWNLOAD_MEDIA" as const,
    resource: {
      url: "https://cdn.example.com/standard-720p.mp4",
      id: "REEL1",
      type: "reel" as const,
      username: "alice",
      extension: "mp4",
      isVideo: true,
      vp9: vp9 as typeof VP9,
    },
  };
}

// Node ships URL.createObjectURL; Chrome's service worker does not. Default to
// the service-worker shape so the data-URL path is what runs unless a test
// opts into the Firefox background-page shape.
const nativeObjectUrl = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

beforeEach(() => {
  Object.assign(URL, { createObjectURL: undefined });
  vi.stubGlobal("chrome", {
    runtime: { id: "test-ext" },
    downloads: {
      download: vi.fn(async () => 77),
    },
  });
});

afterEach(() => {
  Object.assign(URL, nativeObjectUrl);
  vi.unstubAllGlobals();
});

describe("handleDownloadMedia", () => {
  it("calls chrome.downloads.download with the computed full path", async () => {
    const { deps } = setup();
    await deps.settings.patch({ defaultDownloadDirectory: "instagram" });

    const response = await handleDownloadMedia(
      {
        type: "DOWNLOAD_MEDIA",
        resource: {
          url: "https://example.com/ABC.jpg",
          id: "ABC",
          type: "post",
          username: "alice",
          extension: "jpg",
          isVideo: false,
        },
      },
      deps,
    );

    expect(response.ok).toBe(true);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/ABC.jpg",
        filename: expect.stringContaining("instagram/alice-ABC-"),
      }),
    );
  });

  it("honors alwaysPromptSaveAs from settings", async () => {
    const { deps } = setup();
    await deps.settings.patch({ alwaysPromptSaveAs: true });

    await handleDownloadMedia(
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

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ saveAs: true }),
    );
  });

  it("increments the profile's download counter after success", async () => {
    const { deps } = setup();
    await deps.settings.addProfile({ username: "alice", directory: "ig/alice" });

    await handleDownloadMedia(
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

    const settings = await deps.settings.get();
    expect(settings.profileDirectories[0].downloadCount).toBe(1);
    expect(settings.profileDirectories[0].lastDownloadAt).not.toBeNull();
  });

  it("returns { ok: false, error } when chrome.downloads.download throws", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("disk full"),
    );
    const { deps } = setup();
    const response = await handleDownloadMedia(
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
    expect(response).toEqual({ ok: false, error: "disk full" });
  });

  it("rejects blob: URLs with an actionable error before invoking chrome.downloads", async () => {
    const { deps } = setup();
    const response = await handleDownloadMedia(
      {
        type: "DOWNLOAD_MEDIA",
        resource: {
          url: "blob:https://www.instagram.com/abc-123",
          id: "ABC",
          type: "story",
          username: "alice",
          extension: "mp4",
          isVideo: true,
        },
      },
      deps,
    );

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("blob:");
      expect(response.error).toContain("data URL");
    }
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it.each(["BLOB:https://www.instagram.com/abc-123", "  blob:https://www.instagram.com/abc-123"])(
    "rejects %j too — a URL parser would read it as a blob: URL",
    async (url) => {
      const { deps } = setup();
      const response = await handleDownloadMedia(
        {
          type: "DOWNLOAD_MEDIA",
          resource: { url, id: "ABC", type: "story", username: "alice", extension: "mp4", isVideo: true },
        },
        deps,
      );

      expect(response.ok).toBe(false);
      expect(chrome.downloads.download).not.toHaveBeenCalled();
    },
  );

  it("accepts data: URLs from the content-script blob escape hatch", async () => {
    const { deps } = setup();
    const response = await handleDownloadMedia(
      {
        type: "DOWNLOAD_MEDIA",
        resource: {
          url: "data:video/mp4;base64,AAAAGGZ0eXA=",
          id: "ABC",
          type: "story",
          username: "alice",
          extension: "mp4",
          isVideo: true,
        },
      },
      deps,
    );

    expect(response.ok).toBe(true);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "data:video/mp4;base64,AAAAGGZ0eXA=" }),
    );
  });
});

describe("handleDownloadMedia — VP9 rendition", () => {
  it("downloads the remuxed file instead of resource.url and reports usedVp9: true", async () => {
    const { deps, remux } = await setupWithVp9();

    const response = await handleDownloadMedia(reelMessage(), deps);

    expect(remux.build).toHaveBeenCalledWith(VP9);
    expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
    // No URL.createObjectURL, as in Chrome's service worker, so the file travels
    // as a data URL. 0x010203 → "AQID".
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "data:video/mp4;base64,AQID",
        filename: expect.stringMatching(/^instagram\/alice-REEL1-.*\.mp4$/),
      }),
    );
  });

  it("ignores the rendition while the user's setting is off — the default — whatever the sender attached", async () => {
    const { deps, remux } = setup();

    const response = await handleDownloadMedia(reelMessage(), deps);

    expect(remux.build).not.toHaveBeenCalled();
    // No usedVp9: nothing was attempted, so there is no fallback to report.
    expect(response).toEqual({ ok: true, data: { downloadId: 77 } });
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/standard-720p.mp4" }),
    );
  });

  it("falls back to the standard video and reports usedVp9: false when the remux fails", async () => {
    const { deps, remux } = await setupWithVp9();
    remux.build.mockRejectedValueOnce(new Error("RemuxService.build: fetch returned 403"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await handleDownloadMedia(reelMessage(), deps);

    expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: false } });
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/standard-720p.mp4" }),
    );
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ["a non-HTTPS video URL", { videoUrl: "http://scontent.cdninstagram.com/v.mp4" }],
    ["a video URL off Instagram's CDN", { videoUrl: "https://example.com/v.mp4" }],
    ["an audio URL off Instagram's CDN", { videoUrl: VP9.videoUrl, audioUrl: "https://example.com/a.mp4" }],
    ["a blob: audio URL", { videoUrl: VP9.videoUrl, audioUrl: "blob:https://www.instagram.com/x" }],
    ["a malformed rendition", { videoUrl: 42 }],
    ["a rendition that isn't an object", "https://scontent.cdninstagram.com/v.mp4"],
  ])("never fetches %s — the standard video downloads instead", async (_label, vp9) => {
    const { deps, remux } = await setupWithVp9();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await handleDownloadMedia(reelMessage(vp9), deps);

    expect(remux.build).not.toHaveBeenCalled();
    expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: false } });
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/standard-720p.mp4" }),
    );
  });

  it("accepts a video-only rendition", async () => {
    const { deps, remux } = await setupWithVp9();

    const response = await handleDownloadMedia(reelMessage({ videoUrl: VP9.videoUrl }), deps);

    expect(remux.build).toHaveBeenCalledWith({ videoUrl: VP9.videoUrl });
    expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
  });

  it("bumps the profile's download counter once for a VP9 download", async () => {
    const { deps } = await setupWithVp9();
    await deps.settings.addProfile({ username: "alice", directory: "ig/alice" });

    await handleDownloadMedia(reelMessage(), deps);

    const settings = await deps.settings.get();
    expect(settings.profileDirectories[0].downloadCount).toBe(1);
  });

  it("returns { ok: false } when the download of the remuxed file is rejected", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Download canceled by the user"),
    );
    const { deps } = await setupWithVp9();

    const response = await handleDownloadMedia(reelMessage(), deps);

    // A cancelled Save As must not silently retry with the standard video.
    expect(response).toEqual({ ok: false, error: "Download canceled by the user" });
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
  });

  it("falls back to the standard video when the remuxed file can't be turned into a download URL", async () => {
    const { deps } = await setupWithVp9();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The service worker's only route from a Blob to a URL fails.
    vi.stubGlobal(
      "FileReader",
      class {
        error = new Error("NotReadableError");
        onerror: (() => void) | null = null;
        readAsDataURL() {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );

    const response = await handleDownloadMedia(reelMessage(), deps);

    expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: false } });
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/standard-720p.mp4" }),
    );
    expect(warn).toHaveBeenCalled();
  });

  it("builds one VP9 file at a time: a second request waits for the first", async () => {
    const { deps, remux } = await setupWithVp9();
    const file = () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
    let finishFirst: (blob: Blob) => void = () => undefined;
    remux.build
      .mockReturnValueOnce(new Promise<Blob>((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(file());
    const second = { videoUrl: VP9.videoUrl.replace("vp9-1080p", "another-reel") };

    const first = handleDownloadMedia(reelMessage(), deps);
    const queued = handleDownloadMedia(reelMessage(second), deps);
    await vi.waitFor(() => expect(remux.build).toHaveBeenCalledTimes(1));
    // Give the second request every chance to start early. It must not.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(remux.build).toHaveBeenCalledTimes(1);
    expect(remux.build).toHaveBeenLastCalledWith(VP9);

    finishFirst(file());

    expect(await first).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
    expect(await queued).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
    expect(remux.build).toHaveBeenCalledTimes(2);
    expect(remux.build).toHaveBeenLastCalledWith(second);
  });

  it("lets the next build run after one fails", async () => {
    const { deps, remux } = await setupWithVp9();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    remux.build.mockRejectedValueOnce(new Error("RemuxService.build: fetch returned 403"));

    const [failed, next] = await Promise.all([
      handleDownloadMedia(reelMessage(), deps),
      handleDownloadMedia(reelMessage(), deps),
    ]);

    expect(failed).toEqual({ ok: true, data: { downloadId: 77, usedVp9: false } });
    expect(next).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
  });

  it("remuxes real streams end to end: fetch, remux, and hand the file to the downloads API", async () => {
    const { deps } = await setupWithVp9();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const stream = String(input) === VP9.videoUrl ? VP9_VIDEO_STREAM : AAC_AUDIO_STREAM;
      return new Response(stream, { headers: { "content-length": String(stream.byteLength) } });
    }) as unknown as typeof fetch;

    const response = await handleDownloadMedia(reelMessage(), {
      ...deps,
      remux: createRemuxService({ fetchImpl }),
    });

    expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
    const expected = remuxToMp4([VP9_VIDEO_STREAM, AAC_AUDIO_STREAM]);
    const [{ url }] = (chrome.downloads.download as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url.startsWith("data:video/mp4;base64,")).toBe(true);
    const downloaded = Uint8Array.from(atob(url.split(",")[1]), (char) => char.charCodeAt(0));
    expect(downloaded.length).toBe(expected.length);
    expect(Array.from(downloaded)).toEqual(Array.from(expected));
  });

  describe("where the background can mint blob: URLs (Firefox)", () => {
    type ChangeListener = (delta: { id: number; state?: { current: string } }) => void;
    let listeners: ChangeListener[];
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      listeners = [];
      createObjectURL = vi.fn(() => "blob:moz-extension://uuid/remuxed");
      revokeObjectURL = vi.fn();
      Object.assign(URL, { createObjectURL, revokeObjectURL });
      vi.stubGlobal("chrome", {
        runtime: { id: "test-ext" },
        downloads: {
          download: vi.fn(async () => 77),
          search: vi.fn(async () => [{ id: 77, state: "in_progress" }]),
          onChanged: {
            addListener: (listener: ChangeListener) => listeners.push(listener),
            removeListener: (listener: ChangeListener) => {
              listeners = listeners.filter((l) => l !== listener);
            },
          },
        },
      });
    });

    it("frees the blob: URL of a download that finished before the listener was in place", async () => {
      (chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: 77, state: "complete" },
      ]);
      const { deps } = await setupWithVp9();

      await handleDownloadMedia(reelMessage(), deps);
      await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(1));

      expect(chrome.downloads.search).toHaveBeenCalledWith({ id: 77 });
      expect(listeners).toHaveLength(0);
    });

    it("falls back to the standard video when the blob: URL can't be minted", async () => {
      createObjectURL.mockImplementationOnce(() => {
        throw new Error("out of memory");
      });
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { deps } = await setupWithVp9();

      const response = await handleDownloadMedia(reelMessage(), deps);

      expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: false } });
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://cdn.example.com/standard-720p.mp4" }),
      );
      expect(revokeObjectURL).not.toHaveBeenCalled();
    });

    it("downloads a blob: URL — Firefox rejects data: URLs — and revokes it when the download settles", async () => {
      const { deps } = await setupWithVp9();

      const response = await handleDownloadMedia(reelMessage(), deps);

      expect(response).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({ url: "blob:moz-extension://uuid/remuxed" }),
      );
      // Still downloading: the blob has to stay alive.
      expect(revokeObjectURL).not.toHaveBeenCalled();

      listeners.forEach((listener) => listener({ id: 12, state: { current: "complete" } }));
      expect(revokeObjectURL).not.toHaveBeenCalled(); // someone else's download

      listeners.forEach((listener) => listener({ id: 77, state: { current: "complete" } }));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:moz-extension://uuid/remuxed");
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(listeners).toHaveLength(0);
    });

    it("revokes the blob: URL straight away when the download is rejected", async () => {
      (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("invalid filename"),
      );
      const { deps } = await setupWithVp9();

      const response = await handleDownloadMedia(reelMessage(), deps);

      expect(response).toEqual({ ok: false, error: "invalid filename" });
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:moz-extension://uuid/remuxed");
      expect(listeners).toHaveLength(0);
    });
  });
});

describe("keeping the background alive while a download is pending", () => {
  let getPlatformInfo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Only the interval is faked: FileReader and storage keep their real timing.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    getPlatformInfo = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { id: "test-ext", getPlatformInfo },
      downloads: { download: vi.fn(async () => 77) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls an extension API every 10 s during a slow remux, so Firefox doesn't unload the page mid-download", async () => {
    const { deps, remux } = await setupWithVp9();
    let finish: (blob: Blob) => void = () => undefined;
    remux.build.mockReturnValueOnce(new Promise<Blob>((resolve) => (finish = resolve)));

    const pending = handleDownloadMedia(reelMessage(), deps);
    await vi.advanceTimersByTimeAsync(35_000);

    // 35 s is past Firefox's ~30 s idle unload; three pokes have reset its clock.
    expect(getPlatformInfo).toHaveBeenCalledTimes(3);
    expect(chrome.downloads.download).not.toHaveBeenCalled();

    finish(new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }));
    expect(await pending).toEqual({ ok: true, data: { downloadId: 77, usedVp9: true } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps poking while the downloads API waits on a Save As dialog", async () => {
    let pick: (id: number) => void = () => undefined;
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<number>((resolve) => (pick = resolve)),
    );

    const pending = handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "alice.zip",
      saveAs: true,
    });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(getPlatformInfo).toHaveBeenCalledTimes(4);

    pick(9);
    expect(await pending).toEqual({ ok: true, data: { downloadId: 9 } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops poking when the download fails", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("disk full"),
    );
    const { deps } = setup();

    const response = await handleDownloadMedia(standardReelMessage(), deps);

    expect(response).toEqual({ ok: false, error: "disk full" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("error text returned across the boundary", () => {
  it("is capped, so a browser that quotes a whole data: URL can't flood the toast", async () => {
    const quoted = `Type error for parameter options (Error processing url: Error: Access denied for URL data:application/zip;base64,${"A".repeat(5_000_000)})`;
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error(quoted),
    );

    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "alice.zip",
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.length).toBeLessThanOrEqual(301);
      expect(response.error.startsWith("Type error for parameter options")).toBe(true);
      expect(response.error.endsWith("…")).toBe(true);
    }
  });

  it("leaves a short message untouched — the cancel wording the content script matches on survives", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Download canceled by the user"),
    );
    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "alice.zip",
    });
    expect(response).toEqual({ ok: false, error: "Download canceled by the user" });
  });
});

describe("data: URLs from content scripts, where the browser rejects them (Firefox)", () => {
  type ChangeListener = (delta: { id: number; state?: { current: string } }) => void;
  let listeners: ChangeListener[];
  let minted: Blob[];
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = [];
    minted = [];
    revokeObjectURL = vi.fn();
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        minted.push(blob);
        return `blob:moz-extension://uuid/${minted.length}`;
      }),
      revokeObjectURL,
    });
    vi.stubGlobal("chrome", {
      runtime: { id: "test-ext" },
      downloads: {
        download: vi.fn(async () => 77),
        search: vi.fn(async () => [{ id: 77, state: "in_progress" }]),
        onChanged: {
          addListener: (listener: ChangeListener) => listeners.push(listener),
          removeListener: (listener: ChangeListener) => {
            listeners = listeners.filter((l) => l !== listener);
          },
        },
      },
    });
  });

  async function bytesOf(blob: Blob): Promise<number[]> {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }

  it("re-mints a carousel zip's data: URL as a blob: URL with the same bytes and type", async () => {
    // "PK\x03\x04" — the first four bytes of a zip.
    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "alice-ABC.zip",
      saveAs: true,
    });

    expect(response).toEqual({ ok: true, data: { downloadId: 77 } });
    expect(chrome.downloads.download).toHaveBeenCalledWith({
      url: "blob:moz-extension://uuid/1",
      filename: "alice-ABC.zip",
      saveAs: true,
    });
    expect(minted[0].type).toBe("application/zip");
    expect(await bytesOf(minted[0])).toEqual([0x50, 0x4b, 0x03, 0x04]);

    // Kept alive until the download finishes, then freed.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    listeners.forEach((listener) => listener({ id: 77, state: { current: "complete" } }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:moz-extension://uuid/1");
  });

  it("re-mints a story's content-script-converted data: URL the same way", async () => {
    const { deps } = setup();

    const response = await handleDownloadMedia(
      {
        type: "DOWNLOAD_MEDIA",
        resource: {
          url: "data:video/mp4;base64,AAAAGGZ0eXA=",
          id: "STORY1",
          type: "story",
          username: "alice",
          extension: "mp4",
          isVideo: true,
        },
      },
      deps,
    );

    expect(response).toEqual({ ok: true, data: { downloadId: 77 } });
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "blob:moz-extension://uuid/1" }),
    );
    expect(minted[0].type).toBe("video/mp4");
    expect(await bytesOf(minted[0])).toEqual([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
  });

  it("frees the blob: URL when the user cancels the Save As dialog", async () => {
    (chrome.downloads.download as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Download canceled by the user"),
    );

    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "alice-ABC.zip",
      saveAs: true,
    });

    expect(response).toEqual({ ok: false, error: "Download canceled by the user" });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:moz-extension://uuid/1");
  });

  it("passes an HTTPS URL through untouched — nothing to mint, nothing to free", async () => {
    const { deps } = setup();

    await handleDownloadMedia(standardReelMessage(), deps);

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/standard-720p.mp4" }),
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it("still reports success if the cleanup listener can't be registered", async () => {
    chrome.downloads.onChanged.addListener = () => {
      throw new Error("listener registration failed");
    };

    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "alice-ABC.zip",
    });

    // The download has started; losing the cleanup hook must not turn it into a failure.
    expect(response).toEqual({ ok: true, data: { downloadId: 77 } });
  });
});

describe("handleDownloadZip", () => {
  it("rejects blob: URLs with an actionable error before invoking chrome.downloads", async () => {
    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "blob:https://www.instagram.com/abc-123",
      filename: "instagram/alice/zip.zip",
      saveAs: true,
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain("blob:");
      expect(response.error).toContain("data URL");
    }
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it("accepts data: URLs and forwards to chrome.downloads.download", async () => {
    const response = await handleDownloadZip({
      type: "DOWNLOAD_ZIP",
      dataUrl: "data:application/zip;base64,UEsDBA==",
      filename: "instagram/alice/zip.zip",
      saveAs: true,
    });

    expect(response.ok).toBe(true);
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "data:application/zip;base64,UEsDBA==",
        filename: "instagram/alice/zip.zip",
        saveAs: true,
      }),
    );
  });
});
