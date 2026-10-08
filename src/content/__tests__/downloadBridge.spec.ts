import { afterEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({
  success: vi.fn(() => () => undefined),
  failure: vi.fn(() => () => undefined),
  info: vi.fn(() => () => undefined),
  loading: vi.fn(() => vi.fn()),
  dispose: vi.fn(),
}));

vi.mock("../../services/download/download", () => ({
  createDownloadService: () => ({ queue }),
}));
vi.mock("../../services/settings/settings", () => ({
  createSettingsService: () => ({}),
}));
vi.mock("../../services/toast/toast", () => ({
  createToastService: () => toast,
}));
vi.mock("../flow/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../flow/download")>()),
  handleDownloadClick: vi.fn(async () => undefined),
}));

import { downloadViaFlow, referenceTypeToCanonical, reportVp9Lookup } from "../downloadBridge";
import { handleDownloadClick } from "../flow/download";

afterEach(() => {
  vi.clearAllMocks();
});

describe("referenceTypeToCanonical", () => {
  it("maps uppercase reference codes", () => {
    expect(referenceTypeToCanonical("POST")).toBe("post");
    expect(referenceTypeToCanonical("REEL")).toBe("reel");
    expect(referenceTypeToCanonical("STOR")).toBe("story");
    expect(referenceTypeToCanonical("HGHT")).toBe("highlight");
    expect(referenceTypeToCanonical("THRD")).toBe("threads");
  });

  it("maps lowercase strings (as used by handlers like storyOnClicked)", () => {
    expect(referenceTypeToCanonical("story")).toBe("story");
    expect(referenceTypeToCanonical("post")).toBe("post");
    expect(referenceTypeToCanonical("reel")).toBe("reel");
    expect(referenceTypeToCanonical("highlight")).toBe("highlight");
    expect(referenceTypeToCanonical("threads")).toBe("threads");
  });

  it("falls back to post for unknown or undefined input", () => {
    expect(referenceTypeToCanonical(undefined)).toBe("post");
    expect(referenceTypeToCanonical("")).toBe("post");
    expect(referenceTypeToCanonical("unknown")).toBe("post");
  });
});

describe("downloadViaFlow — VP9 rendition", () => {
  const vp9 = {
    videoUrl: "https://cdn.example.com/vp9-1080p.mp4",
    audioUrl: "https://cdn.example.com/aac.mp4",
  };
  const params = {
    url: "https://cdn.example.com/standard-720p.mp4",
    username: "alice",
    id: "REEL1",
    type: "reel" as const,
  };

  it("carries the rendition into the MediaResource, keeping the standard URL and .mp4 extension", async () => {
    await downloadViaFlow({ ...params, vp9 });

    expect(handleDownloadClick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          url: params.url,
          extension: "mp4",
          isVideo: true,
          type: "reel",
          vp9,
        }),
      ],
      expect.anything(),
    );
  });

  it("adds no vp9 key when the handler found no rendition", async () => {
    await downloadViaFlow({ ...params, vp9: undefined });

    const [[resource]] = vi.mocked(handleDownloadClick).mock.calls[0];
    expect("vp9" in resource).toBe(false);
  });

  it("on right-click Save As: shows the loading toast, queues with saveAs, and stays quiet on success", async () => {
    const dismiss = vi.fn();
    toast.loading.mockReturnValueOnce(dismiss);
    queue.mockResolvedValueOnce({ ok: true, downloadId: 1, usedVp9: true });

    await downloadViaFlow({ ...params, vp9 }, true);

    expect(toast.loading).toHaveBeenCalledWith("Preparing VP9 download…");
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ vp9 }), { saveAs: true });
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.failure).not.toHaveBeenCalled();
  });

  it("on right-click Save As: tells the user when the standard video was saved instead", async () => {
    queue.mockResolvedValueOnce({ ok: true, downloadId: 1, usedVp9: false });

    await downloadViaFlow({ ...params, vp9 }, true);

    expect(toast.info).toHaveBeenCalledWith("Downloaded @alice in standard quality — VP9 failed");
  });

  it("ignores a second click on a reel whose VP9 download is still being prepared", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(handleDownloadClick).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    const first = downloadViaFlow({ ...params, vp9 });
    await downloadViaFlow({ ...params, vp9 });

    // The second click starts nothing and says why.
    expect(handleDownloadClick).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith("VP9 download already in progress");

    finish();
    await first;

    // Once the first has settled, the reel can be downloaded again.
    await downloadViaFlow({ ...params, vp9 });
    expect(handleDownloadClick).toHaveBeenCalledTimes(2);
  });

  it("recognizes the same stream under a differently signed URL", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(handleDownloadClick).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    // The CDN signature lives in the query string, and a fresh page fetch can return a new one.
    const signed = (signature: string) => ({ ...vp9, videoUrl: `${vp9.videoUrl}?oh=${signature}&oe=6A0B` });

    const first = downloadViaFlow({ ...params, vp9: signed("00_AfA") });
    await downloadViaFlow({ ...params, vp9: signed("00_AfB") });

    expect(handleDownloadClick).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith("VP9 download already in progress");

    finish();
    await first;
  });

  it("does not mistake a different reel for the one in flight", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(handleDownloadClick).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const other = { ...vp9, videoUrl: "https://cdn.example.com/another-reel-vp9.mp4" };

    const first = downloadViaFlow({ ...params, vp9 });
    await downloadViaFlow({ ...params, id: "REEL2", vp9: other });

    expect(handleDownloadClick).toHaveBeenCalledTimes(2);
    expect(toast.info).not.toHaveBeenCalled();

    finish();
    await first;
  });

  it("lets the reel be downloaded again after a failed attempt", async () => {
    vi.mocked(handleDownloadClick).mockRejectedValueOnce(new Error("boom"));

    await expect(downloadViaFlow({ ...params, vp9 })).rejects.toThrow("boom");
    await downloadViaFlow({ ...params, vp9 });

    expect(handleDownloadClick).toHaveBeenCalledTimes(2);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("never holds back a download that has no VP9 rendition", async () => {
    vi.mocked(handleDownloadClick).mockImplementationOnce(() => new Promise<void>(() => undefined));

    void downloadViaFlow(params);
    await downloadViaFlow(params);

    expect(handleDownloadClick).toHaveBeenCalledTimes(2);
  });
});

describe("reportVp9Lookup", () => {
  it("shows a loading toast and hands back its dismiss function", () => {
    const dismiss = vi.fn();
    toast.loading.mockReturnValueOnce(dismiss);

    const done = reportVp9Lookup();

    expect(toast.loading).toHaveBeenCalledWith("Checking for a VP9 version…");
    expect(dismiss).not.toHaveBeenCalled();
    done();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
