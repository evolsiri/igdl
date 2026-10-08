import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../downloadBridge", () => ({
  downloadViaFlow: vi.fn(async () => undefined),
  reportFailure: vi.fn(),
}));

vi.mock("../../extractors/fn", () => ({
  checkType: vi.fn(() => "pc"),
  getUrlFromInfoApi: vi.fn(async () => null),
  openInNewTab: vi.fn(() => undefined),
}));

vi.mock("../../extractors/storage", () => ({
  storageCache: {
    canonical: { preferVp9Reels: false },
    settings: { setting_format_use_indexing: true },
  },
}));

import { postOnClicked } from "../post";
import { downloadViaFlow } from "../../downloadBridge";
import { getUrlFromInfoApi } from "../../extractors/fn";
import { storageCache } from "../../extractors/storage";

const STANDARD_URL = "https://cdn.example.com/standard-720p.mp4";
const VP9 = {
  videoUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/vp9-1080p.mp4",
  audioUrl: "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/aac.mp4",
};
const MANIFEST = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
  <AdaptationSet contentType="video">
    <Representation codecs="vp09.00.40.08" mimeType="video/mp4" width="1080" height="1920" bandwidth="3"><BaseURL>${VP9.videoUrl}</BaseURL></Representation>
  </AdaptationSet>
  <AdaptationSet contentType="audio">
    <Representation codecs="mp4a.40.5" mimeType="audio/mp4" bandwidth="1"><BaseURL>${VP9.audioUrl}</BaseURL></Representation>
  </AdaptationSet>
</Period></MPD>`;

/** What `getUrlFromInfoApi` returns for a single video: the info-API item plus the resolved `url`. */
function infoItem(extra: Record<string, unknown> = {}) {
  return {
    url: STANDARD_URL,
    owner: "alice",
    taken_at: 1_700_000_000,
    product_type: "clips",
    video_dash_manifest: MANIFEST,
    ...extra,
  };
}

function setVp9(enabled: boolean) {
  (storageCache.canonical as { preferVp9Reels: boolean }).preferVp9Reels = enabled;
}

afterEach(() => {
  document.body.innerHTML = "";
  setVp9(false);
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
});

/** A feed article with a download button in its action bar. */
function mountArticle(pathname = "/"): HTMLAnchorElement {
  window.history.replaceState({}, "", pathname);
  document.body.innerHTML = "<article><section><div></div></section></article>";
  const anchor = document.createElement("a");
  anchor.className = "download-btn";
  document.querySelector("article section div")!.appendChild(anchor);
  return anchor;
}

describe("postOnClicked — a reel shown as a feed post", () => {
  it("downloads the standard video while the VP9 setting is off", async () => {
    const target = mountArticle();
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem());

    await postOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", type: "post", vp9: undefined }),
      false,
    );
  });

  it("passes the VP9 rendition for a reel once the setting is on", async () => {
    setVp9(true);
    const target = mountArticle();
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem());

    await postOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, type: "post", vp9: VP9 }),
      false,
    );
  });

  it("recognizes a reel opened in a post dialog", async () => {
    setVp9(true);
    const target = mountArticle("/p/DAbc123/");
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem());

    await postOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(expect.objectContaining({ vp9: VP9 }), false);
  });

  it("still downloads through the DOM fallback, without VP9, when the info API has no answer", async () => {
    setVp9(true);
    const target = mountArticle();
    const video = document.createElement("video");
    video.setAttribute("src", "https://scontent.cdninstagram.com/v/fallback.mp4");
    document.querySelector("article section div")!.appendChild(video);
    // getUrlFromInfoApi resolves null by default in this spec.

    await postOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://scontent.cdninstagram.com/v/fallback.mp4",
        type: "post",
        vp9: undefined,
      }),
      false,
    );
  });

  it("keeps the standard file for a video that isn't a reel, even with the setting on", async () => {
    setVp9(true);
    const target = mountArticle();
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem({ product_type: "feed" }));

    await postOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, vp9: undefined }),
      false,
    );
  });
});
