import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dismissLookup } = vi.hoisted(() => ({ dismissLookup: vi.fn() }));

vi.mock("../../downloadBridge", () => ({
  downloadViaFlow: vi.fn(async () => undefined),
  reportFailure: vi.fn(),
  reportVp9Lookup: vi.fn(() => dismissLookup),
}));

vi.mock("../../extractors/fn", async () => {
  const actual = await vi.importActual<typeof import("../../extractors/fn")>("../../extractors/fn");
  return {
    fetchHtml: vi.fn(async () => []),
    // The real one: which reel a click means is read from the URL.
    findPostId: actual.findPostId,
    getDataFromAPI: vi.fn(async () => null),
    getUrlFromInfoApi: vi.fn(async () => null),
    openInNewTab: vi.fn(() => undefined),
  };
});

vi.mock("../../extractors/storage", () => ({
  storageCache: {
    canonical: { preferVp9Reels: false },
    reelsEdgesData: new Map<string, unknown>(),
  },
}));

import { reelsOnClicked } from "../reels";
import { downloadViaFlow, reportVp9Lookup } from "../../downloadBridge";
import { fetchHtml, getDataFromAPI, getUrlFromInfoApi, openInNewTab } from "../../extractors/fn";
import { storageCache } from "../../extractors/storage";

const STANDARD_URL = "https://cdn.example.com/standard-720p.mp4";
const VP9 = {
  videoUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/vp9-1080p.mp4",
  audioUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/aac.mp4",
};
const MANIFEST = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet contentType="video">
    <Representation codecs="avc1.64001F" mimeType="video/mp4" width="720" height="1280" bandwidth="2"><BaseURL>https://scontent-lax3-1.cdninstagram.com/o1/v/t16/h264-720p.mp4</BaseURL></Representation>
    <Representation codecs="vp09.00.40.08" mimeType="video/mp4" width="1080" height="1920" bandwidth="3"><BaseURL>${VP9.videoUrl}</BaseURL></Representation>
  </AdaptationSet>
  <AdaptationSet contentType="audio">
    <Representation codecs="mp4a.40.5" mimeType="audio/mp4" bandwidth="1"><BaseURL>${VP9.audioUrl}</BaseURL></Representation>
  </AdaptationSet>
</Period></MPD>`;

function setVp9(enabled: boolean) {
  (storageCache.canonical as { preferVp9Reels: boolean }).preferVp9Reels = enabled;
}

/** A download button two levels under its wrapper, as on the reels feed. */
function button(className = "download-btn"): HTMLAnchorElement {
  const wrapper = document.createElement("div");
  const row = document.createElement("div");
  const anchor = document.createElement("a");
  anchor.className = className;
  row.appendChild(anchor);
  wrapper.appendChild(row);
  document.body.appendChild(wrapper);
  return anchor;
}

/** Embeds the reels-feed JSON the way Instagram server-renders it into the page. */
function embedReel(media: Record<string, unknown>) {
  const script = document.createElement("script");
  script.type = "application/json";
  script.textContent = JSON.stringify({
    require: [{ data: { xdt_api__v1__clips__home__connection_v2: { edges: [{ node: { media } }] } } }],
  });
  document.body.appendChild(script);
}

function reelMedia(extra: Record<string, unknown> = {}) {
  return {
    code: "CODE1",
    video_versions: [{ url: STANDARD_URL }],
    user: { username: "alice" },
    taken_at: 1_700_000_000,
    product_type: "clips",
    ...extra,
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/reels/CODE1/");
});

afterEach(() => {
  document.body.innerHTML = "";
  setVp9(false);
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
});

describe("reelsOnClicked — VP9 setting off (default)", () => {
  it("downloads the standard video and never looks a VP9 rendition up", async () => {
    embedReel(reelMedia({ video_dash_manifest: MANIFEST }));

    await reelsOnClicked(button(), false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", type: "reel", vp9: undefined }),
      false,
    );
    expect(getDataFromAPI).not.toHaveBeenCalled();
    expect(reportVp9Lookup).not.toHaveBeenCalled();
  });

  it("names the clicked reel for the info-API tier too, even after the feed has scrolled on", async () => {
    // Nothing in the page describes the reel, so the handler ends up at the info API.
    vi.mocked(fetchHtml).mockImplementationOnce(async () => {
      window.history.replaceState({}, "", "/reels/CODE2/");
      return [] as unknown as NodeListOf<HTMLScriptElement>;
    });
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce({
      url: STANDARD_URL,
      owner: "alice",
      taken_at: 1_700_000_000,
    });

    await reelsOnClicked(button(), false);

    expect(window.location.pathname).toBe("/reels/CODE2/");
    expect(getUrlFromInfoApi).toHaveBeenCalledWith(null, 0, "CODE1");
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", type: "reel" }),
      false,
    );
  });

  it("downloads nothing through the info-API tier when the URL named no reel at click time", async () => {
    window.history.replaceState({}, "", "/reels/");
    vi.mocked(fetchHtml).mockImplementationOnce(async () => {
      // A reel scrolls into the URL while the page fetch is pending. It is not the one clicked.
      window.history.replaceState({}, "", "/reels/CODE2/");
      return [] as unknown as NodeListOf<HTMLScriptElement>;
    });

    await reelsOnClicked(button(), false);

    expect(getUrlFromInfoApi).not.toHaveBeenCalled();
    expect(downloadViaFlow).not.toHaveBeenCalled();
  });
});

describe("reelsOnClicked — VP9 setting on", () => {
  beforeEach(() => setVp9(true));

  it("passes the VP9 rendition from the page's own reel JSON, keeping the standard URL as fallback", async () => {
    embedReel(reelMedia({ video_dash_manifest: MANIFEST }));

    await reelsOnClicked(button(), false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, type: "reel", vp9: VP9 }),
      false,
    );
    expect(getDataFromAPI).not.toHaveBeenCalled();
    expect(reportVp9Lookup).not.toHaveBeenCalled();
  });

  it("looks the manifest up through the info API, by the reel's own shortcode, when the page JSON doesn't carry one", async () => {
    embedReel(reelMedia());
    vi.mocked(getDataFromAPI).mockResolvedValueOnce({
      code: "CODE1",
      product_type: "clips",
      video_dash_manifest: MANIFEST,
    });

    await reelsOnClicked(button(), false);

    expect(getDataFromAPI).toHaveBeenCalledTimes(1);
    expect(getDataFromAPI).toHaveBeenCalledWith(null, "CODE1");
    expect(downloadViaFlow).toHaveBeenCalledWith(expect.objectContaining({ vp9: VP9 }), false);
  });

  it("keeps a loading toast up for exactly as long as that lookup runs", async () => {
    embedReel(reelMedia());
    let dismissedDuringLookup = true;
    vi.mocked(getDataFromAPI).mockImplementationOnce(async () => {
      dismissedDuringLookup = dismissLookup.mock.calls.length > 0;
      return { code: "CODE1", product_type: "clips", video_dash_manifest: MANIFEST };
    });
    let dismissedBeforeDownload = false;
    vi.mocked(downloadViaFlow).mockImplementationOnce(async () => {
      dismissedBeforeDownload = dismissLookup.mock.calls.length > 0;
    });

    await reelsOnClicked(button(), false);

    expect(reportVp9Lookup).toHaveBeenCalledTimes(1);
    expect(dismissedDuringLookup).toBe(false);
    // The flow puts up its own toasts; the lookup's must be gone by then.
    expect(dismissedBeforeDownload).toBe(true);
    expect(dismissLookup).toHaveBeenCalledTimes(1);
  });

  it("still asks for the clicked reel after the feed has scrolled on to the next one", async () => {
    embedReel(reelMedia());
    // The page fetch takes a moment; meanwhile the user scrolls and the feed rewrites the URL.
    vi.mocked(fetchHtml).mockImplementationOnce(async () => {
      window.history.replaceState({}, "", "/reels/CODE2/");
      return [] as unknown as NodeListOf<HTMLScriptElement>;
    });
    vi.mocked(getDataFromAPI).mockResolvedValueOnce({
      code: "CODE1",
      product_type: "clips",
      video_dash_manifest: MANIFEST,
    });

    await reelsOnClicked(button(), false);

    expect(window.location.pathname).toBe("/reels/CODE2/");
    expect(getDataFromAPI).toHaveBeenCalledWith(null, "CODE1");
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", vp9: VP9 }),
      false,
    );
  });

  it("drops the VP9 rendition when the lookup answers with a different reel", async () => {
    embedReel(reelMedia());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(getDataFromAPI).mockResolvedValueOnce({
      code: "CODE2",
      product_type: "clips",
      video_dash_manifest: MANIFEST,
    });

    await reelsOnClicked(button(), false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("VP9 lookup answered with another post"));
    warn.mockRestore();

    // Another reel's video must never be saved under this reel's name.
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", vp9: undefined }),
      false,
    );
  });

  it("goes ahead in standard quality when the lookup takes too long", async () => {
    vi.useFakeTimers();
    try {
      embedReel(reelMedia());
      vi.mocked(getDataFromAPI).mockReturnValueOnce(new Promise(() => undefined));

      const clicked = reelsOnClicked(button(), false);
      await vi.advanceTimersByTimeAsync(4000);
      await clicked;

      expect(downloadViaFlow).toHaveBeenCalledWith(
        expect.objectContaining({ url: STANDARD_URL, vp9: undefined }),
        false,
      );
      expect(vi.getTimerCount()).toBe(0);
      expect(dismissLookup).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still downloads the standard video when that lookup comes back empty", async () => {
    embedReel(reelMedia());

    await reelsOnClicked(button(), false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, vp9: undefined }),
      false,
    );
  });

  it("downloads the standard video for a reel Instagram hasn't encoded in VP9", async () => {
    embedReel(reelMedia({ video_dash_manifest: MANIFEST.replace("vp09.00.40.08", "avc1.640028") }));

    await reelsOnClicked(button(), false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, vp9: undefined }),
      false,
    );
  });

  it("uses the VP9 rendition on a right-click Save As too", async () => {
    embedReel(reelMedia({ video_dash_manifest: MANIFEST }));

    await reelsOnClicked(button(), true);

    expect(downloadViaFlow).toHaveBeenCalledWith(expect.objectContaining({ vp9: VP9 }), true);
  });

  it("opens the standard video in a new tab without any VP9 lookup", async () => {
    embedReel(reelMedia());

    await reelsOnClicked(button("newtab-btn"), false);

    expect(openInNewTab).toHaveBeenCalledWith(STANDARD_URL);
    expect(getDataFromAPI).not.toHaveBeenCalled();
    expect(downloadViaFlow).not.toHaveBeenCalled();
  });

  it("passes the VP9 rendition when the reel is resolved through the info API instead of page JSON", async () => {
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce({
      url: STANDARD_URL,
      owner: "alice",
      taken_at: 1_700_000_000,
      video_dash_manifest: MANIFEST,
    });

    await reelsOnClicked(button(), false);

    expect(getUrlFromInfoApi).toHaveBeenCalledWith(null, 0, "CODE1");
    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", type: "reel", vp9: VP9 }),
      false,
    );
  });
});
