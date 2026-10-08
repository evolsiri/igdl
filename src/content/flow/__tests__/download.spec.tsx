import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShadowMount } from "../../modals/mount";
import { handleDownloadClick, queueResource } from "../download";
import type { QueueResult } from "../../../services/download/download";
import { createSettingsService } from "../../../services/settings/settings";
import { inMemoryStorage } from "../../../services/settings/storage";
import type { MediaResource } from "../../../types/instagram";

function makeResource(overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    url: "https://example.com/a.jpg",
    id: "A",
    type: "post",
    username: "alice",
    extension: "jpg",
    isVideo: false,
    ...overrides,
  };
}

interface ModalCapture {
  /** The most recently rendered Preact tree — tests use it to fire choice callbacks. */
  lastTree: unknown;
  mount: ShadowMount;
}

function capturingMount(): ModalCapture {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.appendChild(container);
  const cap: ModalCapture = {
    lastTree: null,
    mount: {
      host,
      shadow,
      render(tree) {
        cap.lastTree = tree;
      },
      dispose: vi.fn(() => {
        cap.lastTree = null;
      }),
    },
  };
  return cap;
}

function setup() {
  const storage = inMemoryStorage();
  const settings = createSettingsService({ storage });
  const download = {
    queue: vi.fn(async (): Promise<QueueResult> => ({ ok: true, downloadId: 1 })),
  };
  const toast = {
    success: vi.fn(() => () => undefined),
    failure: vi.fn(() => () => undefined),
    info: vi.fn(() => () => undefined),
    loading: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
  };
  const modal = capturingMount();
  const mountFactory = vi.fn(() => modal.mount);
  return { settings, download, toast, modal, mountFactory };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleDownloadClick", () => {
  it("triggers Save As immediately when alwaysPromptSaveAs is enabled, bypassing all routing", async () => {
    const { settings, download, toast, mountFactory } = setup();
    await settings.addProfile({ username: "alice", directory: "ig/alice" });
    const base = await settings.get();
    const settingsSnapshot = { ...base, alwaysPromptSaveAs: true };

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(download.queue).toHaveBeenCalledWith(expect.anything(), { saveAs: true });
    expect(mountFactory).not.toHaveBeenCalled();
  });

  it("downloads silently when the profile has a configured directory", async () => {
    const { settings, download, toast, mountFactory } = setup();
    await settings.addProfile({ username: "alice", directory: "ig/alice" });
    const settingsSnapshot = await settings.get();

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(download.queue).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
    expect(mountFactory).not.toHaveBeenCalled(); // no popup
  });

  it("triggers Save As (no popup) when the profile is on the never-ask list", async () => {
    const { settings, download, toast, mountFactory } = setup();
    await settings.addNeverAsk("alice");
    const settingsSnapshot = await settings.get();

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(download.queue).toHaveBeenCalledWith(expect.anything(), { saveAs: true });
    expect(mountFactory).not.toHaveBeenCalled();
  });

  it("shows NoDirPopup when neither configured nor opted out", async () => {
    const { settings, download, toast, modal, mountFactory } = setup();
    // Kick off; returns a pending promise because user hasn't clicked yet.
    const pending = handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
    });
    // Flush all pending microtasks so handleDownloadClick progresses past the
    // async settings.get() and into promptNoDir (which calls mountFactory sync).
    await new Promise((r) => setTimeout(r, 0));
    expect(mountFactory).toHaveBeenCalled();

    // Inspect the rendered tree — it should be a NoDirPopup element.
    const tree = modal.lastTree as { props?: { onChoice?: (a: unknown) => void } };
    expect(tree).toBeTruthy();

    // Simulate user clicking "Download to default".
    tree.props!.onChoice!({ kind: "default" });

    await pending;

    expect(download.queue).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it("persists a new profile when user picks setDirectory", async () => {
    const { settings, download, toast, modal, mountFactory } = setup();
    const pending = handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
    });
    await new Promise((r) => setTimeout(r, 0));

    const tree = modal.lastTree as { props: { onChoice: (a: unknown) => void } };
    tree.props.onChoice({ kind: "setDirectory", directory: "ig/alice" });

    await pending;

    const updated = await settings.get();
    expect(updated.profileDirectories).toHaveLength(1);
    expect(updated.profileDirectories[0].directory).toBe("ig/alice");
    expect(download.queue).toHaveBeenCalled();
  });

  it("adds the profile to never-ask when user picks neverAsk, and triggers Save As", async () => {
    const { settings, download, toast, modal, mountFactory } = setup();
    const pending = handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
    });
    await new Promise((r) => setTimeout(r, 0));

    const tree = modal.lastTree as { props: { onChoice: (a: unknown) => void } };
    tree.props.onChoice({ kind: "neverAsk" });

    await pending;

    const updated = await settings.get();
    expect(updated.neverAskProfiles.map((e) => e.username)).toContain("alice");
    expect(download.queue).toHaveBeenCalledWith(expect.anything(), { saveAs: true });
  });

  it("cancels gracefully when user dismisses the popup", async () => {
    const { settings, download, toast, modal, mountFactory } = setup();
    const pending = handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
    });
    await new Promise((r) => setTimeout(r, 0));

    const tree = modal.lastTree as { props: { onCancel: () => void } };
    tree.props.onCancel();

    await pending;
    expect(download.queue).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.failure).not.toHaveBeenCalled();
  });

  it("fires an info toast (not failure) when the user cancels the Save As dialog", async () => {
    const { settings, toast, mountFactory } = setup();
    await settings.addProfile({ username: "alice", directory: "ig/alice" });
    const settingsSnapshot = await settings.get();
    const download = {
      queue: vi.fn(async () => ({ ok: false as const, error: "User canceled." })),
    };

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(toast.failure).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("canceled"));
  });

  it("fires a failure toast when every download fails", async () => {
    const { settings, toast, mountFactory } = setup();
    await settings.addProfile({ username: "alice", directory: "ig/alice" });
    const settingsSnapshot = await settings.get();
    const download = {
      queue: vi.fn(async () => ({ ok: false as const, error: "disk full" })),
    };

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(toast.failure).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });

  it("no-ops on empty resource list", async () => {
    const { settings, download, toast, mountFactory } = setup();
    await handleDownloadClick([], { settings, download, toast, mountFactory });
    expect(download.queue).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.failure).not.toHaveBeenCalled();
  });

  it("downloads each item of a multi-item carousel", async () => {
    const { settings, download, toast, mountFactory } = setup();
    await settings.addProfile({ username: "alice", directory: "ig/alice" });
    const settingsSnapshot = await settings.get();
    await handleDownloadClick(
      [
        makeResource({ id: "A", index: 1 }),
        makeResource({ id: "B", index: 2 }),
        makeResource({ id: "C", index: 3 }),
      ],
      { settings, download, toast, mountFactory, settingsSnapshot },
    );
    expect(download.queue).toHaveBeenCalledTimes(3);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("3 items"));
  });
});

describe("handleDownloadClick — reel with a VP9 rendition", () => {
  const vp9 = {
    videoUrl: "https://example.com/vp9-1080p.mp4",
    audioUrl: "https://example.com/aac.mp4",
  };
  const reel = () => makeResource({ type: "reel", extension: "mp4", isVideo: true, vp9 });

  async function configured() {
    const ctx = setup();
    await ctx.settings.addProfile({ username: "alice", directory: "ig/alice" });
    return { ...ctx, settingsSnapshot: await ctx.settings.get() };
  }

  it("shows a loading toast for the remux and dismisses it when the download is queued", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    const dismiss = vi.fn();
    toast.loading.mockReturnValueOnce(dismiss);
    let dismissedBeforeQueueSettled = true;
    download.queue.mockImplementationOnce(async () => {
      dismissedBeforeQueueSettled = dismiss.mock.calls.length > 0;
      return { ok: true, downloadId: 1, usedVp9: true };
    });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(toast.loading).toHaveBeenCalledWith("Preparing VP9 download…");
    expect(dismissedBeforeQueueSettled).toBe(false);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(download.queue).toHaveBeenCalledWith(expect.objectContaining({ vp9 }), undefined);
  });

  it("says the download is VP9 when the VP9 file was saved", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    download.queue.mockResolvedValueOnce({ ok: true, downloadId: 1, usedVp9: true });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(toast.success).toHaveBeenCalledWith("Downloaded @alice in VP9");
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("says so — with an info toast, not a success — when the remux failed and the standard video was saved", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    download.queue.mockResolvedValueOnce({ ok: true, downloadId: 1, usedVp9: false });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(toast.info).toHaveBeenCalledWith("Downloaded @alice in standard quality — VP9 failed");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.failure).not.toHaveBeenCalled();
  });

  it("asks again for the standard video when the background never answered the VP9 request", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    const dismiss = vi.fn();
    toast.loading.mockReturnValueOnce(dismiss);
    download.queue
      // The background's context was torn down mid-remux: no reply at all.
      .mockResolvedValueOnce({ ok: false, error: "Could not establish connection.", transport: true })
      .mockResolvedValueOnce({ ok: true, downloadId: 2 });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(download.queue).toHaveBeenCalledTimes(2);
    const [retried] = download.queue.mock.calls[1] as unknown as [MediaResource];
    expect(retried.url).toBe("https://example.com/a.jpg");
    expect("vp9" in retried).toBe(false);
    expect(toast.info).toHaveBeenCalledWith("Downloaded @alice in standard quality — VP9 failed");
    expect(toast.failure).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the background answered with an error — it already tried the standard video", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    download.queue.mockResolvedValueOnce({ ok: false, error: "disk full" });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(download.queue).toHaveBeenCalledTimes(1);
    expect(toast.failure).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });

  it("reports the failure when the retry gets no answer either", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    download.queue.mockResolvedValue({
      ok: false,
      error: "Extension context invalidated.",
      transport: true,
    });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(download.queue).toHaveBeenCalledTimes(2);
    expect(toast.failure).toHaveBeenCalledWith(
      expect.stringContaining("Extension context invalidated."),
    );
  });

  it("never retries a plain download, whatever the failure", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    download.queue.mockResolvedValueOnce({ ok: false, error: "no receiver", transport: true });

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(download.queue).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when Save As was requested — the dialog may still be open, with the VP9 file behind it", async () => {
    const { download, toast } = await configured();
    const noAnswer = {
      ok: false as const,
      error: "The message port closed before a response was received.",
      transport: true as const,
    };
    download.queue.mockResolvedValueOnce(noAnswer);

    const result = await queueResource(reel(), { download, toast }, { saveAs: true });

    // A second request here would open a second dialog, for the standard video.
    expect(download.queue).toHaveBeenCalledTimes(1);
    expect(result).toEqual(noAnswer);
  });

  it("dismisses the loading toast when the download fails outright", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();
    const dismiss = vi.fn();
    toast.loading.mockReturnValueOnce(dismiss);
    download.queue.mockResolvedValueOnce({ ok: false, error: "disk full" });

    await handleDownloadClick([reel()], { settings, download, toast, mountFactory, settingsSnapshot });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(toast.failure).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });

  it("keeps the plain copy and shows no loading toast for a download without a VP9 rendition", async () => {
    const { settings, download, toast, mountFactory, settingsSnapshot } = await configured();

    await handleDownloadClick([makeResource()], {
      settings,
      download,
      toast,
      mountFactory,
      settingsSnapshot,
    });

    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Downloaded @alice");
  });
});

describe("handleDownloadClick — carousel where Save As was canceled for some items", () => {
  it("says \"1 item\", not \"1 items\", when only one of several was saved", async () => {
    const { settings, toast, mountFactory } = setup();
    await settings.addProfile({ username: "alice", directory: "ig/alice" });
    const settingsSnapshot = await settings.get();
    const download = {
      queue: vi
        .fn<() => Promise<QueueResult>>()
        .mockResolvedValueOnce({ ok: true, downloadId: 1 })
        .mockResolvedValue({ ok: false, error: "Download canceled by the user" }),
    };

    await handleDownloadClick(
      [makeResource({ index: 1 }), makeResource({ index: 2 }), makeResource({ index: 3 })],
      { settings, download, toast, mountFactory, settingsSnapshot },
    );

    expect(toast.success).toHaveBeenCalledWith("Downloaded 1 item from @alice");
  });
});

describe("queueResource", () => {
  it("dismisses the loading toast even when the queue call throws", async () => {
    const { toast } = setup();
    const dismiss = vi.fn();
    toast.loading.mockReturnValueOnce(dismiss);
    const download = { queue: vi.fn(async () => Promise.reject(new Error("boom"))) };
    const resource = makeResource({ vp9: { videoUrl: "https://example.com/vp9.mp4" } });

    await expect(queueResource(resource, { download, toast })).rejects.toThrow("boom");

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
