import { describe, expect, it } from "vitest";
import {
  buildFilename,
  buildFullPath,
  resolveDirectory,
} from "../naming";
import { SETTINGS_DEFAULTS } from "../../settings/schema";
import type { MediaResource } from "../../../types/instagram";
import type { Settings } from "../../../types/settings";

function makeResource(overrides: Partial<MediaResource> = {}): MediaResource {
  return {
    url: "https://example.com/media.jpg",
    id: "ABC",
    type: "post",
    username: "alice",
    extension: "jpeg",
    isVideo: false,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...SETTINGS_DEFAULTS, ...overrides };
}

const FIXED = new Date(2026, 3, 16, 15, 7, 42);

describe("buildFilename", () => {
  it("interpolates username, id, type, datetime with the default template", () => {
    const settings = makeSettings({ filenameTemplate: "{username}-{id}-{datetime}" });
    expect(buildFilename(makeResource(), settings, FIXED)).toBe(
      "alice-ABC-20260416_150742.jpg",
    );
  });

  it("replaces jpeg with jpg when the toggle is on", () => {
    const settings = makeSettings({ replaceJpegWithJpg: true });
    expect(buildFilename(makeResource({ extension: "jpeg" }), settings, FIXED).endsWith(".jpg")).toBe(true);
  });

  it("keeps jpeg when the toggle is off", () => {
    const settings = makeSettings({ replaceJpegWithJpg: false });
    expect(buildFilename(makeResource({ extension: "jpeg" }), settings, FIXED).endsWith(".jpeg")).toBe(true);
  });

  it("omits {datetime} when enableDatetimeFormat is false (+ strips separators)", () => {
    const settings = makeSettings({
      enableDatetimeFormat: false,
      filenameTemplate: "{username}-{id}-{datetime}",
    });
    expect(buildFilename(makeResource(), settings, FIXED)).toBe("alice-ABC.jpg");
  });

  it("applies carousel indexing when useCarouselIndexing is true", () => {
    const settings = makeSettings({ useCarouselIndexing: true });
    expect(
      buildFilename(makeResource({ index: 3 }), settings, FIXED),
    ).toBe("alice-ABC-20260416_150742_3.jpg");
  });

  it("omits index when useCarouselIndexing is false", () => {
    const settings = makeSettings({
      useCarouselIndexing: false,
      filenameTemplate: "{username}-{id}",
    });
    const filename = buildFilename(makeResource({ index: 2 }), settings, FIXED);
    expect(filename).toBe("alice-ABC.jpg");
  });

  it("interpolates {type} placeholder", () => {
    const settings = makeSettings({ filenameTemplate: "{type}-{id}" });
    expect(buildFilename(makeResource({ type: "reel" }), settings, FIXED)).toBe("reel-ABC.jpg");
  });

  it("sanitizes illegal filename characters", () => {
    const settings = makeSettings({ filenameTemplate: "{username}" });
    const filename = buildFilename(makeResource({ username: "a/b:c" }), settings, FIXED);
    expect(filename).toMatch(/^a_b_c\./);
  });

  it("lowercases and strips a leading dot on the extension", () => {
    const settings = makeSettings();
    const filename = buildFilename(makeResource({ extension: ".JPG" }), settings, FIXED);
    expect(filename.endsWith(".jpg")).toBe(true);
  });
});

describe("resolveDirectory", () => {
  it("returns the profile-specific directory when present", () => {
    const settings = makeSettings({
      profileDirectories: [
        {
          username: "alice",
          directory: "instagram/alice",
          downloadCount: 0,
          lastDownloadAt: null,
          addedAt: 0,
          lastEditedAt: 0,
        },
      ],
    });
    expect(resolveDirectory("Alice", settings)).toBe("instagram/alice");
  });

  it("returns the default download directory when no profile match", () => {
    const settings = makeSettings({ defaultDownloadDirectory: "downloads/ig" });
    expect(resolveDirectory("bob", settings)).toBe("downloads/ig");
  });

  it("is case-insensitive on username", () => {
    const settings = makeSettings({
      profileDirectories: [
        {
          username: "alice",
          directory: "ig/alice",
          downloadCount: 0,
          lastDownloadAt: null,
          addedAt: 0,
          lastEditedAt: 0,
        },
      ],
    });
    expect(resolveDirectory("ALICE", settings)).toBe("ig/alice");
  });
});

describe("buildFullPath", () => {
  it("joins resolved directory and filename with /", () => {
    const settings = makeSettings({
      defaultDownloadDirectory: "instagram",
      filenameTemplate: "{username}-{id}",
    });
    expect(buildFullPath(makeResource(), settings, FIXED)).toBe("instagram/alice-ABC.jpg");
  });
});
