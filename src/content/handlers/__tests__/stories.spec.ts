import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../downloadBridge", () => ({
  downloadViaFlow: vi.fn(async () => undefined),
  reportFailure: vi.fn(),
}));

vi.mock("../../extractors/fn", () => ({
  getUrlFromInfoApi: vi.fn(async () => null),
  openInNewTab: vi.fn(() => undefined),
}));

vi.mock("../../extractors/storage", () => ({
  storageCache: {
    settings: { setting_format_use_indexing: false },
    storiesReelsMedia: new Map<string, unknown>(),
    storiesUserIds: new Map<string, string>(),
  },
}));

import { storyOnClicked } from "../stories";
import { downloadViaFlow, reportFailure } from "../../downloadBridge";
import { openInNewTab } from "../../extractors/fn";

function setPathname(pathname: string) {
  Object.defineProperty(window, "location", {
    value: { pathname },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("storyOnClicked — DOM fallback (feed story, 2-part URL)", () => {
  it("downloads a video story when no <section> ancestor but video is found walking up", async () => {
    setPathname("/stories/alice/");

    const wrapper = document.createElement("div");
    const header = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    header.appendChild(button);

    const content = document.createElement("div");
    const video = document.createElement("video");
    video.src = "https://cdn.example.com/story.mp4";
    content.appendChild(video);

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cdn.example.com/story.mp4",
        username: "alice",
        type: "story",
      }),
      false,
    );
  });

  it("downloads an image story via img[decoding=sync] found walking up", async () => {
    setPathname("/stories/bob/");

    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";

    const img = document.createElement("img");
    img.setAttribute("decoding", "sync");
    img.srcset = "https://cdn.example.com/story.jpg 320w";

    wrapper.appendChild(button);
    wrapper.appendChild(img);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/story.jpg" }),
      false,
    );
  });

  it("returns silently when no ancestor contains story media", async () => {
    setPathname("/stories/carol/");

    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    document.body.appendChild(button);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).not.toHaveBeenCalled();
  });

  it("extracts video URL via .src property when getAttribute('src') would be absent", async () => {
    setPathname("/stories/dave/");

    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";

    const video = document.createElement("video");
    // Simulate React-style property-only src (no HTML attribute reflected).
    Object.defineProperty(video, "src", {
      get: () => "https://cdn.example.com/react-video.mp4",
      configurable: true,
    });
    // Ensure getAttribute("src") would return null (attribute not set).
    // jsdom reflects .src to the attribute on real assignment, but this
    // Object.defineProperty bypasses that reflection.

    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/react-video.mp4" }),
      false,
    );
  });
});

describe("storyOnClicked — <section> ancestor present (profile story, 3-part URL)", () => {
  it("uses <section> as search root and downloads when section is an ancestor", async () => {
    setPathname("/stories/eve/99999/");

    const section = document.createElement("section");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";

    const video = document.createElement("video");
    video.src = "https://cdn.example.com/profile-story.mp4";

    section.appendChild(button);
    section.appendChild(video);
    document.body.appendChild(section);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/profile-story.mp4" }),
      false,
    );
  });
});

describe("storyOnClicked — blob: URL conversion (Instagram MSE/HLS)", () => {
  it("fetches the blob, converts to a data URL, and dispatches with UUID-derived id", async () => {
    setPathname("/stories/eve/");

    const blob = new Blob([new Uint8Array([0x00, 0x00, 0x00, 0x18])], { type: "video/mp4" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      blob: async () => blob,
    } as Response);

    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    const video = document.createElement("video");
    Object.defineProperty(video, "src", {
      get: () => "blob:https://www.instagram.com/abc-123",
      configurable: true,
    });

    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    expect(fetchSpy).toHaveBeenCalledWith("blob:https://www.instagram.com/abc-123");
    expect(downloadViaFlow).toHaveBeenCalledTimes(1);
    const [params] = (downloadViaFlow as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params.url).toMatch(/^data:video\/mp4;base64,/);
    expect(params.username).toBe("eve");
    expect(params.type).toBe("story");
    // UUID preserved from the original blob URL — see storyGetDownloadableUrl.
    expect(params.id).toBe("abc-123");

    fetchSpy.mockRestore();
  });

  it("reports failure when the blob fetch rejects", async () => {
    setPathname("/stories/frank/");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));

    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    const video = document.createElement("video");
    Object.defineProperty(video, "src", {
      get: () => "blob:https://www.instagram.com/dead-blob",
      configurable: true,
    });

    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledWith(expect.stringContaining("MSE video stream"));

    fetchSpy.mockRestore();
  });

  it("prefers a non-blob <source src> over a blob <video>.src on the same node", async () => {
    setPathname("/stories/grace/");

    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";

    const video = document.createElement("video");
    Object.defineProperty(video, "src", {
      get: () => "blob:https://www.instagram.com/should-not-be-used",
      configurable: true,
    });
    const source = document.createElement("source");
    source.setAttribute("src", "https://cdn.example.com/declarative.mp4");
    video.appendChild(source);

    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/declarative.mp4" }),
      false,
    );
  });

  it("does NOT convert a blob URL on the open-in-new-tab path (non-download-btn click)", async () => {
    setPathname("/stories/henry/");

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const wrapper = document.createElement("div");
    // The button does NOT have the "download-btn" class — this is the
    // open-in-new-tab branch. saveAs is also false.
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "view-btn";

    const video = document.createElement("video");
    Object.defineProperty(video, "src", {
      get: () => "blob:https://www.instagram.com/preview-blob",
      configurable: true,
    });

    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    // No conversion happened, no download dispatched, original blob URL
    // forwarded to openInNewTab.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadViaFlow).not.toHaveBeenCalled();
    expect(openInNewTab).toHaveBeenCalledWith("blob:https://www.instagram.com/preview-blob");

    fetchSpy.mockRestore();
  });
});
