import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../downloadBridge", () => ({
  downloadViaFlow: vi.fn(async () => undefined),
  reportFailure: vi.fn(),
}));

vi.mock("../../extractors/fn", () => ({
  openInNewTab: vi.fn(async () => undefined),
}));

vi.mock("../../extractors/storage", () => ({
  storageCache: {
    settings: { setting_format_use_indexing: true },
  },
}));

import { highlightsOnClicked } from "../highlights";
import { downloadViaFlow, reportFailure } from "../../downloadBridge";
import { openInNewTab } from "../../extractors/fn";
import { CACHE_KEYS } from "../../../services/media-cache/keys";
import type { HighlightMedia } from "../../../types/media-cache";

function setPathname(pathname: string) {
  Object.defineProperty(window, "location", {
    value: { pathname },
    configurable: true,
    writable: true,
  });
}

function installChromeStorage(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) {
            if (k in store) out[k] = store[k];
          }
          return out;
        }),
      },
    },
  };
}

/**
 * Builds a `<section>` shaped like Instagram's highlights modal. Returns the
 * download button anchor — the handler walks up from this to the section.
 */
function buildHighlightsModal(opts: {
  /** mediaIndex to mark active by giving that dot exactly one child. */
  activeDotIndex: number;
  /** Total number of carousel dots (== number of items in the active reel). */
  dotCount: number;
  /** Optional images to inject; first is treated as active by `findVisibleHighlightMedia`. */
  images?: Array<{ src: string; rect: { left: number; top: number; width: number; height: number } }>;
  /** Optional video src to inject as the active slide. */
  videoSrc?: string;
  /** Width of the section so visibility math has something to compare against. */
  sectionWidth?: number;
}): HTMLAnchorElement {
  const sectionWidth = opts.sectionWidth ?? 600;
  const section = document.createElement("section");
  Object.defineProperty(section, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      right: sectionWidth,
      bottom: 800,
      width: sectionWidth,
      height: 800,
    }),
  });

  // Header row containing the dot indicators + the download button. The
  // handler reads dots from `target.parentElement.firstElementChild` and the
  // section is found by walking up.
  const header = document.createElement("div");
  const dotRow = document.createElement("div");
  for (let i = 0; i < opts.dotCount; i++) {
    const dot = document.createElement("div");
    if (i === opts.activeDotIndex) {
      const inner = document.createElement("div");
      dot.appendChild(inner);
    }
    dotRow.appendChild(dot);
  }
  header.appendChild(dotRow);
  const button = document.createElement("a") as HTMLAnchorElement;
  button.className = "download-btn";
  header.appendChild(button);
  section.appendChild(header);

  // Optional media inside the section for tier C fallback.
  if (opts.videoSrc) {
    const video = document.createElement("video");
    video.src = opts.videoSrc;
    Object.defineProperty(video, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: sectionWidth,
        bottom: 800,
        width: sectionWidth,
        height: 800,
      }),
    });
    section.appendChild(video);
  }
  for (const img of opts.images ?? []) {
    const el = document.createElement("img");
    el.setAttribute("referrerpolicy", "origin-when-cross-origin");
    el.classList.add("a", "b"); // matches `classList.length > 1`
    el.src = img.src;
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({
        left: img.rect.left,
        top: img.rect.top,
        right: img.rect.left + img.rect.width,
        bottom: img.rect.top + img.rect.height,
        width: img.rect.width,
        height: img.rect.height,
      }),
    });
    section.appendChild(el);
  }

  document.body.appendChild(section);
  return button;
}

beforeEach(() => {
  installChromeStorage();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("highlightsOnClicked — XHR cache (tier A)", () => {
  it("downloads the SECOND reel's first item when its pk is in the URL", async () => {
    setPathname("/stories/highlights/2222/");
    const cache: HighlightMedia = {
      "1111": {
        id: "highlight:1111",
        username: "alice",
        items: [
          { takenAt: 1700000000, url: "https://cdn/travel.jpg", isVideo: false, extension: "jpg" },
        ],
      },
      "2222": {
        id: "highlight:2222",
        username: "alice",
        items: [
          { takenAt: 1700000050, url: "https://cdn/food.jpg", isVideo: false, extension: "jpg" },
        ],
      },
    };
    installChromeStorage({ [CACHE_KEYS.highlightMedia]: cache });

    const button = buildHighlightsModal({ activeDotIndex: 0, dotCount: 1 });
    await highlightsOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledTimes(1);
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cdn/food.jpg",
        username: "alice",
        id: "highlight:2222",
        type: "highlight",
      }),
      false,
    );
  });

  it("indexes by mediaIndex into the active reel's items", async () => {
    setPathname("/stories/highlights/2222/");
    const cache: HighlightMedia = {
      "2222": {
        id: "highlight:2222",
        username: "alice",
        items: [
          { takenAt: 1, url: "https://cdn/food-1.jpg", isVideo: false, extension: "jpg" },
          { takenAt: 2, url: "https://cdn/food-2.jpg", isVideo: false, extension: "jpg" },
          { takenAt: 3, url: "https://cdn/food-3.mp4", isVideo: true, extension: "mp4" },
        ],
      },
    };
    installChromeStorage({ [CACHE_KEYS.highlightMedia]: cache });

    const button = buildHighlightsModal({ activeDotIndex: 2, dotCount: 3 });
    await highlightsOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cdn/food-3.mp4",
        index: 3,
      }),
      false,
    );
  });

  it("falls through to next tier on cache miss for the active pk", async () => {
    setPathname("/stories/highlights/9999/");
    installChromeStorage({
      [CACHE_KEYS.highlightMedia]: {
        "1111": {
          id: "highlight:1111",
          username: "alice",
          items: [{ takenAt: 0, url: "https://cdn/x.jpg", isVideo: false, extension: "jpg" }],
        },
      } satisfies HighlightMedia,
    });

    const button = buildHighlightsModal({
      activeDotIndex: 0,
      dotCount: 1,
      images: [
        { src: "https://cdn/visible.jpg", rect: { left: 100, top: 0, width: 400, height: 600 } },
      ],
    });
    await highlightsOnClicked(button, false);

    // Tier C visible-image fallback must serve, with bare URL metadata.
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn/visible.jpg" }),
      false,
    );
  });
});

describe("highlightsOnClicked — DOM fallback (tier C)", () => {
  it("ignores preloaded sibling reel images that are positioned offscreen", async () => {
    setPathname("/stories/highlights/2222/");
    installChromeStorage(); // empty cache

    const button = buildHighlightsModal({
      activeDotIndex: 0,
      dotCount: 1,
      sectionWidth: 600,
      images: [
        // Offscreen left (previous reel preload).
        { src: "https://cdn/prev.jpg", rect: { left: -800, top: 0, width: 600, height: 800 } },
        // Visible.
        { src: "https://cdn/active.jpg", rect: { left: 0, top: 0, width: 600, height: 800 } },
        // Offscreen right (next reel preload).
        { src: "https://cdn/next.jpg", rect: { left: 800, top: 0, width: 600, height: 800 } },
      ],
    });
    await highlightsOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn/active.jpg" }),
      false,
    );
  });

  it("picks the largest visible candidate when several overlap", async () => {
    setPathname("/stories/highlights/2222/");
    installChromeStorage();

    const button = buildHighlightsModal({
      activeDotIndex: 0,
      dotCount: 1,
      sectionWidth: 600,
      images: [
        // A small thumbnail also visible inside the section.
        { src: "https://cdn/thumb.jpg", rect: { left: 0, top: 0, width: 60, height: 60 } },
        // The full-size active image.
        { src: "https://cdn/full.jpg", rect: { left: 50, top: 100, width: 500, height: 600 } },
      ],
    });
    await highlightsOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn/full.jpg" }),
      false,
    );
  });

  it("reports failure when no media is found anywhere", async () => {
    setPathname("/stories/highlights/2222/");
    installChromeStorage();

    const button = buildHighlightsModal({ activeDotIndex: 0, dotCount: 1 });
    await highlightsOnClicked(button, false);

    expect(downloadViaFlow).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledWith(
      expect.stringContaining("could not locate active media"),
    );
  });
});

/**
 * Builds a highlights modal whose only visible video has a `blob:` `.src`.
 * Uses `Object.defineProperty` to install a getter — this simulates real
 * Instagram MSE/HLS, where the player sets `videoEl.src` imperatively at
 * runtime (not via static markup) and may bypass the attribute-reflection
 * path entirely. The handler reads via the property-then-attribute fallback
 * at `findVisibleHighlightMedia` (see `highlights.ts`); this fixture
 * exercises the property-only branch.
 */
function buildHighlightsModalWithBlobVideo(opts: { blobUrl: string; sectionWidth?: number }): HTMLAnchorElement {
  const sectionWidth = opts.sectionWidth ?? 600;
  const section = document.createElement("section");
  Object.defineProperty(section, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: sectionWidth, bottom: 800, width: sectionWidth, height: 800 }),
  });
  const header = document.createElement("div");
  const dotRow = document.createElement("div");
  const dot = document.createElement("div");
  dot.appendChild(document.createElement("div"));
  dotRow.appendChild(dot);
  header.appendChild(dotRow);
  const button = document.createElement("a") as HTMLAnchorElement;
  button.className = "download-btn";
  header.appendChild(button);
  section.appendChild(header);

  const video = document.createElement("video");
  Object.defineProperty(video, "src", { get: () => opts.blobUrl, configurable: true });
  Object.defineProperty(video, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: sectionWidth, bottom: 800, width: sectionWidth, height: 800 }),
  });
  section.appendChild(video);

  document.body.appendChild(section);
  return button;
}

describe("highlightsOnClicked — blob: URL conversion (tier C)", () => {
  it("fetches the blob, converts to a data URL, and dispatches with UUID-derived id", async () => {
    setPathname("/stories/highlights/2222/");
    installChromeStorage();

    const blob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x20])], { type: "video/mp4" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as Response);

    const button = buildHighlightsModalWithBlobVideo({
      blobUrl: "blob:https://www.instagram.com/highlight-uuid-1",
    });
    await highlightsOnClicked(button, false);

    expect(fetchSpy).toHaveBeenCalledWith("blob:https://www.instagram.com/highlight-uuid-1");
    expect(downloadViaFlow).toHaveBeenCalledTimes(1);
    const [params] = (downloadViaFlow as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params.url).toMatch(/^data:video\/mp4;base64,/);
    expect(params.type).toBe("highlight");
    expect(params.id).toBe("highlight-uuid-1");

    fetchSpy.mockRestore();
  });

  it("reports failure when the blob fetch rejects", async () => {
    setPathname("/stories/highlights/2222/");
    installChromeStorage();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("blob revoked"));

    const button = buildHighlightsModalWithBlobVideo({
      blobUrl: "blob:https://www.instagram.com/highlight-uuid-2",
    });
    await highlightsOnClicked(button, false);

    expect(downloadViaFlow).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledWith(expect.stringContaining("MSE video stream"));

    fetchSpy.mockRestore();
  });

  it("does NOT convert a blob URL on the open-in-new-tab path (non-download-btn click)", async () => {
    setPathname("/stories/highlights/2222/");
    installChromeStorage();

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const button = buildHighlightsModalWithBlobVideo({
      blobUrl: "blob:https://www.instagram.com/highlight-preview-blob",
    });
    button.className = "view-btn"; // not "download-btn" — open-in-new-tab path
    await highlightsOnClicked(button, false);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadViaFlow).not.toHaveBeenCalled();
    expect(openInNewTab).toHaveBeenCalledWith("blob:https://www.instagram.com/highlight-preview-blob");

    fetchSpy.mockRestore();
  });
});
