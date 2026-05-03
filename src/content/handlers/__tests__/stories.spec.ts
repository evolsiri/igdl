import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../downloadBridge", () => ({
  downloadViaFlow: vi.fn(async () => undefined),
  reportFailure: vi.fn(),
}));

vi.mock("../../extractors/fn", () => ({
  getUrlFromInfoApi: vi.fn(async () => null),
  openInNewTab: vi.fn(async () => undefined),
}));

vi.mock("../../extractors/storage", () => ({
  storageCache: {
    settings: { setting_format_use_indexing: false },
    storiesReelsMedia: new Map<string, unknown>(),
    storiesUserIds: new Map<string, string>(),
  },
}));

import { storyOnClicked } from "../stories";
import { downloadViaFlow } from "../../downloadBridge";

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
