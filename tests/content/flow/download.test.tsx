import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShadowMount } from "../../../src/content/modals/mount";
import { handleDownloadClick } from "../../../src/content/flow/download";
import { createSettingsService } from "../../../src/services/settings/settings";
import { inMemoryStorage } from "../../../src/services/settings/storage";
import type { MediaResource } from "../../../src/types/instagram";

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
  const download = { queue: vi.fn(async () => ({ ok: true as const, downloadId: 1 })) };
  const toast = {
    success: vi.fn(() => () => undefined),
    failure: vi.fn(() => () => undefined),
    info: vi.fn(() => () => undefined),
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

  it("downloads silently when the profile is on the never-ask list", async () => {
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

    expect(download.queue).toHaveBeenCalled();
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

  it("adds the profile to never-ask when user picks neverAsk", async () => {
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
    expect(download.queue).toHaveBeenCalled();
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

