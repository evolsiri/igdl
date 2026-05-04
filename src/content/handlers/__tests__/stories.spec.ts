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

/**
 * Embeds a JSON `<script>` containing `xdt_api__v1__feed__reels_media` SSR
 * data — the same shape Instagram emits on the initial story-page render.
 * Wrapped in a deeply nested envelope to exercise the recursive walker.
 *
 * `type="application/json"` matches Instagram's real markup (their SSR
 * scripts carry that type plus a `data-sjs` attribute) and prevents jsdom
 * from evaluating the content as JavaScript.
 */
function installSsrScript(reelsMedia: Array<Record<string, unknown>>): HTMLScriptElement {
  const payload = {
    require: [
      [
        "RelayPrefetchedStreamCache",
        "next",
        [],
        { __bbox: { result: { data: { xdt_api__v1__feed__reels_media: { reels_media: reelsMedia } } } } },
      ],
    ],
  };
  const script = document.createElement("script");
  script.setAttribute("type", "application/json");
  script.textContent = JSON.stringify(payload);
  document.body.appendChild(script);
  return script;
}

describe("storyOnClicked — Tier B (xdt_api__v1__feed__reels_media SSR)", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const taken = Math.floor(Date.now() / 1000) - 60;

  it("(3-part URL) extracts URL by item.pk match before falling through to DOM", async () => {
    setPathname("/stories/alice/9999/");

    installSsrScript([
      {
        id: "highlight:reel-1",
        user: { username: "alice" },
        items: [
          {
            pk: "8888",
            expiring_at: future,
            taken_at: taken,
            image_versions2: { candidates: [{ url: "https://cdn.example.com/wrong.jpg" }] },
          },
          {
            pk: "9999",
            expiring_at: future,
            taken_at: taken,
            image_versions2: { candidates: [{ url: "https://cdn.example.com/right.jpg" }] },
            video_versions: [{ url: "https://cdn.example.com/right.mp4" }],
          },
        ],
      },
    ]);

    // DOM has only a blob video — Tier C would normally fail. Tier B should
    // catch first.
    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    const video = document.createElement("video");
    Object.defineProperty(video, "src", {
      get: () => "blob:https://www.instagram.com/should-be-bypassed",
      configurable: true,
    });
    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await storyOnClicked(button, false);

    // No conversion attempt should have been made — Tier B short-circuited.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cdn.example.com/right.mp4",
        username: "alice",
        type: "story",
        id: "highlight:reel-1",
      }),
      false,
    );

    fetchSpy.mockRestore();
  });

  it("(2-part URL) matches by username + dot-count, uses active dot index", async () => {
    setPathname("/stories/bob/");

    installSsrScript([
      {
        id: "highlight:reel-2",
        user: { username: "bob" },
        items: [
          {
            pk: "1",
            expiring_at: future,
            taken_at: taken,
            image_versions2: { candidates: [{ url: "https://cdn.example.com/item-1.jpg" }] },
          },
          {
            pk: "2",
            expiring_at: future,
            taken_at: taken,
            image_versions2: { candidates: [{ url: "https://cdn.example.com/item-2.jpg" }] },
          },
        ],
      },
    ]);

    // Build the DOM structure the handler expects: button.parentElement has
    // a firstElementChild whose `:scope>div` children are the dot indicators.
    // The dot with exactly one child is the active media index.
    const wrapper = document.createElement("div");
    const dotRow = document.createElement("div");
    const dot0 = document.createElement("div");
    const dot1 = document.createElement("div");
    dot1.appendChild(document.createElement("div")); // dot1 is active → mediaIndex = 1
    dotRow.appendChild(dot0);
    dotRow.appendChild(dot1);
    wrapper.appendChild(dotRow);

    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    wrapper.appendChild(button);

    // DOM also has a video so the handler doesn't bail at the section walk.
    const video = document.createElement("video");
    Object.defineProperty(video, "src", {
      get: () => "blob:https://www.instagram.com/should-be-bypassed",
      configurable: true,
    });
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await storyOnClicked(button, false);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cdn.example.com/item-2.jpg",
        username: "bob",
        type: "story",
      }),
      false,
    );

    fetchSpy.mockRestore();
  });

  it("rejects stale SSR (item count !== dot count) for 2-part URLs and falls through", async () => {
    setPathname("/stories/carol/");

    // SSR has 1 item, but DOM shows 3 dots — stale SSR.
    installSsrScript([
      {
        id: "highlight:reel-3",
        user: { username: "carol" },
        items: [
          {
            pk: "old",
            expiring_at: future,
            taken_at: taken,
            image_versions2: { candidates: [{ url: "https://cdn.example.com/stale.jpg" }] },
          },
        ],
      },
    ]);

    const wrapper = document.createElement("div");
    const dotRow = document.createElement("div");
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      if (i === 0) dot.appendChild(document.createElement("div"));
      dotRow.appendChild(dot);
    }
    wrapper.appendChild(dotRow);

    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    wrapper.appendChild(button);

    // DOM fallback URL for assertion — non-blob so we can verify the tier
    // fell through cleanly instead of erroring.
    const video = document.createElement("video");
    video.src = "https://cdn.example.com/dom-fallback.mp4";
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    // SSR should have been rejected. DOM fallback served instead.
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/dom-fallback.mp4" }),
      false,
    );
    // The stale SSR URL must NOT appear.
    const allCalls = (downloadViaFlow as ReturnType<typeof vi.fn>).mock.calls;
    for (const [params] of allCalls) {
      expect(params.url).not.toBe("https://cdn.example.com/stale.jpg");
    }
  });

  it("(3-part URL) skips expired items and falls through to DOM", async () => {
    setPathname("/stories/dave/12345/");

    const past = Math.floor(Date.now() / 1000) - 3600; // expired
    installSsrScript([
      {
        id: "highlight:reel-4",
        user: { username: "dave" },
        items: [
          {
            pk: "12345",
            expiring_at: past,
            taken_at: taken,
            image_versions2: { candidates: [{ url: "https://cdn.example.com/expired.jpg" }] },
          },
        ],
      },
    ]);

    const wrapper = document.createElement("div");
    const button = document.createElement("a") as HTMLAnchorElement;
    button.className = "download-btn";
    const video = document.createElement("video");
    video.src = "https://cdn.example.com/dom-fresh.mp4";
    wrapper.appendChild(button);
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await storyOnClicked(button, false);

    // Expired SSR rejected by handleMedia, DOM fallback fires.
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.example.com/dom-fresh.mp4" }),
      false,
    );
  });
});
