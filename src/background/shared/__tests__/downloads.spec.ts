import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleDownloadMedia } from "../downloads";
import { createMediaCacheService } from "../../../services/media-cache/media-cache";
import { createSettingsService } from "../../../services/settings/settings";
import { inMemoryStorage } from "../../../services/settings/storage";

function setup() {
  const storage = inMemoryStorage();
  return {
    storage,
    deps: {
      settings: createSettingsService({ storage }),
      mediaCache: createMediaCacheService({ storage }),
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: { id: "test-ext" },
    downloads: {
      download: vi.fn(async () => 77),
    },
  });
});

afterEach(() => {
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
});
