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

import { postDetailOnClicked } from "../post-detail";
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

/** A permalink page: no wrapping article, the button sits inside `section main`. */
function mountDetailPage(pathname: string): HTMLAnchorElement {
  window.history.replaceState({}, "", pathname);
  document.body.innerHTML = "<section><main><div></div></main></section>";
  const anchor = document.createElement("a");
  anchor.className = "download-btn";
  document.querySelector("section main div")!.appendChild(anchor);
  return anchor;
}

describe("postDetailOnClicked", () => {
  it("downloads the standard video while the VP9 setting is off", async () => {
    const target = mountDetailPage("/alice/reel/CODE1/");
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem());

    await postDetailOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, type: "post", vp9: undefined }),
      false,
    );
  });

  it("passes the VP9 rendition on a /:user/reel/:id page once the setting is on", async () => {
    setVp9(true);
    const target = mountDetailPage("/alice/reel/CODE1/");
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem({ product_type: undefined }));

    await postDetailOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ url: STANDARD_URL, username: "alice", vp9: VP9 }),
      false,
    );
  });

  it("passes the VP9 rendition for a reel opened at its /p/:id permalink", async () => {
    setVp9(true);
    const target = mountDetailPage("/p/DAbc123/");
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem());

    await postDetailOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(expect.objectContaining({ vp9: VP9 }), false);
  });

  it("keeps the standard file for a non-reel video at a /p/:id permalink", async () => {
    setVp9(true);
    const target = mountDetailPage("/p/DAbc123/");
    vi.mocked(getUrlFromInfoApi).mockResolvedValueOnce(infoItem({ product_type: "feed" }));

    await postDetailOnClicked(target, false);

    expect(downloadViaFlow).toHaveBeenCalledWith(
      expect.objectContaining({ vp9: undefined }),
      false,
    );
  });
});
