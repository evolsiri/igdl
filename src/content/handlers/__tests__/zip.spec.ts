import { afterEach, describe, expect, it, vi } from "vitest";
import { zipOnClicked, type ZipHandlerDeps } from "../zip";
import { SETTINGS_DEFAULTS } from "../../../services/settings/schema";
import type { ToastService } from "../../../services/toast/toast";
import type { ZipEntry, ZipService } from "../../../services/zip/zip";

function makeDeps(overrides: Partial<ZipHandlerDeps> = {}): ZipHandlerDeps {
  const article = document.createElement("article");
  const zipService: ZipService = {
    build: vi.fn(async () => new Blob(["zipped"], { type: "application/zip" })),
  };
  const toast: ToastService = {
    success: vi.fn(() => () => undefined),
    failure: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  };
  return {
    zipService,
    toast,
    downloadBlob: vi.fn(),
    getInfo: vi.fn(async () => null),
    getArticle: vi.fn(() => article),
    getSettings: () => SETTINGS_DEFAULTS,
    onFailure: vi.fn(),
    ...overrides,
  };
}

function carouselInfo(username: string, id: string, takenAt: number, itemCount: number) {
  return {
    id,
    taken_at: takenAt,
    owner: { username },
    carousel_media: Array.from({ length: itemCount }, (_, i) => ({
      image_versions2: {
        candidates: [{ url: `https://cdn.example/${id}-${i + 1}.jpg` }],
      },
    })),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("zipOnClicked", () => {
  it("builds a zip from every carousel item and anchor-downloads it", async () => {
    const info = carouselInfo("alice", "ABC", 1_700_000_000, 3);
    const deps = makeDeps({
      getInfo: vi.fn(async () => info),
    });

    const anchor = document.createElement("a");
    document.body.appendChild(anchor);
    await zipOnClicked(anchor, deps);

    expect(deps.zipService.build).toHaveBeenCalledTimes(1);
    const entries = (deps.zipService.build as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as ZipEntry[];
    expect(entries.map((e) => e.url)).toEqual([
      "https://cdn.example/ABC-1.jpg",
      "https://cdn.example/ABC-2.jpg",
      "https://cdn.example/ABC-3.jpg",
    ]);
    // Filename template is {username}-{id}-{datetime}, carousel indexing on by default.
    expect(entries[0].filename).toMatch(/^alice-ABC-\d{8}_\d{6}_1\.jpg$/);
    expect(entries[2].filename).toMatch(/_3\.jpg$/);
    expect(deps.downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, outerName] = (deps.downloadBlob as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("application/zip");
    expect(outerName).toMatch(/^alice-ABC-\d{8}_\d{6}\.zip$/);
    expect(deps.toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/3 items from @alice/),
    );
  });

  it("fires a failure toast and skips the download when the post is not a carousel", async () => {
    const info = {
      id: "SINGLE",
      taken_at: 1,
      owner: { username: "bob" },
      // no carousel_media → treated as a single-item post
    };
    const deps = makeDeps({
      getInfo: vi.fn(async () => info),
    });

    const anchor = document.createElement("a");
    await zipOnClicked(anchor, deps);

    expect(deps.zipService.build).not.toHaveBeenCalled();
    expect(deps.downloadBlob).not.toHaveBeenCalled();
    expect(deps.onFailure).toHaveBeenCalledWith("not a carousel post");
    expect(deps.toast.success).not.toHaveBeenCalled();
  });

  it("fires a failure toast when the article cannot be found", async () => {
    const deps = makeDeps({
      getArticle: vi.fn(() => null),
    });
    const anchor = document.createElement("a");

    await zipOnClicked(anchor, deps);

    expect(deps.zipService.build).not.toHaveBeenCalled();
    expect(deps.onFailure).toHaveBeenCalledWith("cannot find article node");
  });

  it("fires a failure toast when the info API returns null", async () => {
    const deps = makeDeps({
      getInfo: vi.fn(async () => null),
    });
    const anchor = document.createElement("a");

    await zipOnClicked(anchor, deps);

    expect(deps.onFailure).toHaveBeenCalledWith("cannot resolve post media");
  });

  it("propagates ZipService.build failures as a failure toast", async () => {
    const info = carouselInfo("alice", "ABC", 1, 2);
    const deps = makeDeps({
      getInfo: vi.fn(async () => info),
      zipService: {
        build: vi.fn(async () => {
          throw new Error("ZipService.build: fetch https://cdn boom");
        }),
      },
    });
    const anchor = document.createElement("a");

    await zipOnClicked(anchor, deps);

    expect(deps.downloadBlob).not.toHaveBeenCalled();
    expect(deps.onFailure).toHaveBeenCalledWith(
      expect.stringContaining("ZipService.build"),
    );
  });

  it("falls back to 'instagram' when owner.username is empty or missing", async () => {
    const info = carouselInfo("", "ABC", 1, 2);
    const deps = makeDeps({
      getInfo: vi.fn(async () => info),
    });
    const anchor = document.createElement("a");

    await zipOnClicked(anchor, deps);

    const [, outerName] = (deps.downloadBlob as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(outerName).toMatch(/^instagram-ABC-/);
  });

  it("passes carousel_media video items through with video_versions[0].url", async () => {
    const info = {
      id: "VID",
      taken_at: 1,
      owner: { username: "alice" },
      carousel_media: [
        {
          image_versions2: { candidates: [{ url: "https://cdn.example/cover.jpg" }] },
        },
        {
          video_versions: [{ url: "https://cdn.example/clip.mp4" }],
        },
      ],
    };
    const deps = makeDeps({
      getInfo: vi.fn(async () => info),
    });
    const anchor = document.createElement("a");

    await zipOnClicked(anchor, deps);

    const entries = (deps.zipService.build as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as ZipEntry[];
    expect(entries[1].url).toBe("https://cdn.example/clip.mp4");
    expect(entries[1].filename).toMatch(/_2\.mp4$/);
  });
});
