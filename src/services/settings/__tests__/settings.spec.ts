import { describe, expect, it, vi } from "vitest";
import {
  createSettingsService,
  SETTINGS_KEY,
  type SettingsService,
} from "../settings";
import {
  SETTINGS_DEFAULTS,
  migrate,
  normalize,
} from "../schema";
import { inMemoryStorage, type KvStorage } from "../storage";

function setup(options: { initial?: unknown; nowStart?: number } = {}): {
  service: SettingsService;
  storage: KvStorage;
  now: () => number;
} {
  const storage = inMemoryStorage(
    options.initial === undefined ? {} : { [SETTINGS_KEY]: options.initial },
  );
  let clock = options.nowStart ?? 1_000_000_000_000;
  const now = () => {
    clock += 1;
    return clock;
  };
  const service = createSettingsService({ storage, now });
  return { service, storage, now };
}

describe("SettingsService", () => {
  describe("get()", () => {
    it("returns SETTINGS_DEFAULTS when storage is empty", async () => {
      const { service } = setup();
      expect(await service.get()).toEqual(SETTINGS_DEFAULTS);
    });

    it("migrates a stored blob through normalize()", async () => {
      const { service } = setup({
        initial: { schemaVersion: 1, theme: "dark", junk: "ignored" },
      });
      const got = await service.get();
      expect(got.theme).toBe("dark");
      expect(got.schemaVersion).toBe(1);
      expect("junk" in got).toBe(false);
    });
  });

  describe("set() / patch()", () => {
    it("set() persists the full blob after normalizing", async () => {
      const { service, storage } = setup();
      await service.set({ ...SETTINGS_DEFAULTS, theme: "light" });
      const stored = await storage.get(SETTINGS_KEY);
      expect(stored).toMatchObject({ theme: "light", schemaVersion: 1 });
    });

    it("patch() merges a partial update", async () => {
      const { service } = setup();
      const result = await service.patch({
        theme: "dark",
        enableThreadsSupport: false,
      });
      expect(result.theme).toBe("dark");
      expect(result.enableThreadsSupport).toBe(false);
      // untouched fields keep their defaults
      expect(result.filenameTemplate).toBe(SETTINGS_DEFAULTS.filenameTemplate);
    });

    it("patch() always produces schemaVersion = 1", async () => {
      const { service } = setup();
      const result = await service.patch({ schemaVersion: 99 as unknown as 1 });
      expect(result.schemaVersion).toBe(1);
    });
  });

  describe("addProfile()", () => {
    it("adds a profile with addedAt, lastEditedAt, downloadCount=0, lastDownloadAt=null", async () => {
      const { service, now } = setup();
      const t0 = now();
      const entry = await service.addProfile({ username: "Alice", directory: "ig/alice" });
      expect(entry).toMatchObject({
        username: "alice",
        directory: "ig/alice",
        downloadCount: 0,
        lastDownloadAt: null,
      });
      expect(entry.addedAt).toBeGreaterThan(t0);
      expect(entry.lastEditedAt).toBe(entry.addedAt);
    });

    it("lowercases and trims the username", async () => {
      const { service } = setup();
      const entry = await service.addProfile({ username: "  ALICE  ", directory: "ig/alice" });
      expect(entry.username).toBe("alice");
    });

    it("rejects duplicate usernames", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      await expect(
        service.addProfile({ username: "Alice", directory: "ig/other" }),
      ).rejects.toThrow(/already exists/);
    });

    it("rejects empty usernames", async () => {
      const { service } = setup();
      await expect(
        service.addProfile({ username: "   ", directory: "ig/x" }),
      ).rejects.toThrow(/empty/);
    });

    it("persists the new entry to storage", async () => {
      const { service, storage } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      const stored = (await storage.get(SETTINGS_KEY)) as { profileDirectories: unknown[] };
      expect(stored.profileDirectories).toHaveLength(1);
    });
  });

  describe("updateProfile()", () => {
    it("updates directory and bumps lastEditedAt", async () => {
      const { service } = setup();
      const original = await service.addProfile({
        username: "alice",
        directory: "ig/alice",
      });
      const updated = await service.updateProfile("alice", { directory: "ig/new" });
      expect(updated.directory).toBe("ig/new");
      expect(updated.lastEditedAt).toBeGreaterThan(original.lastEditedAt);
      expect(updated.addedAt).toBe(original.addedAt);
    });

    it("renames username; lowercases and trims", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      const updated = await service.updateProfile("alice", { username: "  BOB  " });
      expect(updated.username).toBe("bob");
    });

    it("rejects renames that collide with existing usernames", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      await service.addProfile({ username: "bob", directory: "ig/bob" });
      await expect(
        service.updateProfile("alice", { username: "bob" }),
      ).rejects.toThrow(/already exists/);
    });

    it("throws when target username is not found", async () => {
      const { service } = setup();
      await expect(
        service.updateProfile("nobody", { directory: "ig/x" }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("deleteProfile()", () => {
    it("removes the profile", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      await service.deleteProfile("alice");
      const settings = await service.get();
      expect(settings.profileDirectories).toHaveLength(0);
    });

    it("is a no-op for unknown username", async () => {
      const { service } = setup();
      await expect(service.deleteProfile("nobody")).resolves.toBeUndefined();
    });
  });

  describe("incrementDownload()", () => {
    it("increments downloadCount and updates lastDownloadAt", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      await service.incrementDownload("alice");
      await service.incrementDownload("alice");
      const settings = await service.get();
      const row = settings.profileDirectories[0];
      expect(row.downloadCount).toBe(2);
      expect(row.lastDownloadAt).not.toBeNull();
    });

    it("is a no-op if the profile isn't configured", async () => {
      const { service } = setup();
      await expect(service.incrementDownload("nobody")).resolves.toBeUndefined();
    });
  });

  describe("addNeverAsk() / removeNeverAsk()", () => {
    it("addNeverAsk() appends a normalized entry", async () => {
      const { service } = setup();
      await service.addNeverAsk("  BOB  ");
      const settings = await service.get();
      expect(settings.neverAskProfiles).toHaveLength(1);
      expect(settings.neverAskProfiles[0].username).toBe("bob");
    });

    it("addNeverAsk() is idempotent", async () => {
      const { service } = setup();
      await service.addNeverAsk("bob");
      await service.addNeverAsk("bob");
      const settings = await service.get();
      expect(settings.neverAskProfiles).toHaveLength(1);
    });

    it("removeNeverAsk() removes the entry", async () => {
      const { service } = setup();
      await service.addNeverAsk("bob");
      await service.removeNeverAsk("BOB"); // case insensitive
      const settings = await service.get();
      expect(settings.neverAskProfiles).toHaveLength(0);
    });

    it("removeNeverAsk() is a no-op for unknown username", async () => {
      const { service } = setup();
      await expect(service.removeNeverAsk("nobody")).resolves.toBeUndefined();
    });

    it("directory config and never-ask are orthogonal", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      await service.addNeverAsk("alice");
      const settings = await service.get();
      expect(settings.profileDirectories).toHaveLength(1);
      expect(settings.neverAskProfiles).toHaveLength(1);
    });
  });

  describe("resetAll()", () => {
    it("restores SETTINGS_DEFAULTS", async () => {
      const { service } = setup();
      await service.addProfile({ username: "alice", directory: "ig/alice" });
      await service.addNeverAsk("bob");
      await service.patch({ theme: "dark" });

      await service.resetAll();
      expect(await service.get()).toEqual(SETTINGS_DEFAULTS);
    });

    it("is idempotent", async () => {
      const { service } = setup();
      await service.resetAll();
      await service.resetAll();
      expect(await service.get()).toEqual(SETTINGS_DEFAULTS);
    });
  });

  describe("subscribe()", () => {
    it("fires listener on writes through the service", async () => {
      const { service } = setup();
      const listener = vi.fn();
      service.subscribe(listener);
      await service.patch({ theme: "dark" });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });

    it("unsubscribe() stops further notifications", async () => {
      const { service } = setup();
      const listener = vi.fn();
      const off = service.subscribe(listener);
      await service.patch({ theme: "dark" });
      off();
      await service.patch({ theme: "light" });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("fires on external writes to storage (cross-context sync)", async () => {
      const { service, storage } = setup();
      const listener = vi.fn();
      service.subscribe(listener);
      await storage.set(SETTINGS_KEY, { ...SETTINGS_DEFAULTS, theme: "light" });
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "light" }),
      );
    });

    it("ignores changes to other storage keys", async () => {
      const { service, storage } = setup();
      const listener = vi.fn();
      service.subscribe(listener);
      await storage.set("some_other_key", { junk: 1 });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe("normalize()", () => {
  it("returns defaults for undefined", () => {
    expect(normalize(undefined)).toEqual(SETTINGS_DEFAULTS);
  });

  it("returns defaults for non-object input", () => {
    expect(normalize("nope" as unknown)).toEqual(SETTINGS_DEFAULTS);
  });

  it("drops unknown fields", () => {
    const out = normalize({ ...SETTINGS_DEFAULTS, somethingNew: 42 } as unknown);
    expect("somethingNew" in out).toBe(false);
  });

  it("coerces invalid theme value back to default", () => {
    const out = normalize({ theme: "neon" } as unknown);
    expect(out.theme).toBe("system");
  });

  it("deduplicates profile directories by username (case-insensitive)", () => {
    const out = normalize({
      profileDirectories: [
        { username: "Alice", directory: "ig/a", downloadCount: 0, addedAt: 1, lastEditedAt: 1 },
        { username: "alice", directory: "ig/b", downloadCount: 0, addedAt: 1, lastEditedAt: 1 },
      ],
    } as unknown);
    expect(out.profileDirectories).toHaveLength(1);
    expect(out.profileDirectories[0].username).toBe("alice");
  });
  it("defaults profileDirectoriesSort when missing", () => {
    const out = normalize({ theme: "light" } as unknown);
    expect(out.profileDirectoriesSort).toEqual({ key: "addedAt", direction: "desc" });
  });

  it("preserves a valid profileDirectoriesSort", () => {
    const out = normalize({
      profileDirectoriesSort: { key: "username", direction: "asc" },
    } as unknown);
    expect(out.profileDirectoriesSort).toEqual({ key: "username", direction: "asc" });
  });

  it("coerces an invalid profileDirectoriesSort to the default", () => {
    const out = normalize({
      profileDirectoriesSort: { key: "bogus", direction: "sideways" },
    } as unknown);
    expect(out.profileDirectoriesSort).toEqual({ key: "addedAt", direction: "desc" });
  });
});

describe("setProfileDirectoriesSort", () => {
  it("persists the chosen sort and round-trips via get()", async () => {
    const { service } = setup();
    await service.setProfileDirectoriesSort({ key: "username", direction: "asc" });
    const s = await service.get();
    expect(s.profileDirectoriesSort).toEqual({ key: "username", direction: "asc" });
  });

  it("overwrites an existing sort", async () => {
    const { service } = setup();
    await service.setProfileDirectoriesSort({ key: "downloadCount", direction: "desc" });
    await service.setProfileDirectoriesSort({ key: "addedAt", direction: "desc" });
    const s = await service.get();
    expect(s.profileDirectoriesSort).toEqual({ key: "addedAt", direction: "desc" });
  });

  it("defaults to addedAt/desc for blobs saved before this field existed", async () => {
    const { service } = setup({
      initial: { schemaVersion: 1, theme: "dark" /* no profileDirectoriesSort */ },
    });
    const s = await service.get();
    expect(s.profileDirectoriesSort).toEqual({ key: "addedAt", direction: "desc" });
  });
});

describe("migrate()", () => {
  it("defaults for undefined input", () => {
    expect(migrate(undefined)).toEqual(SETTINGS_DEFAULTS);
  });

  it("coerces an unknown future schemaVersion to a valid v1 blob", () => {
    const out = migrate({ schemaVersion: 99, theme: "light" });
    expect(out.schemaVersion).toBe(1);
    expect(out.theme).toBe("light");
  });
});
