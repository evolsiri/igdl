import type {
  NeverAskEntry,
  ProfileDirectoriesSort,
  ProfileDirEntry,
  Settings,
} from "../../types/settings";
import { migrate, normalize, SETTINGS_DEFAULTS } from "./schema";
import { chromeStorageLocal, type KvStorage } from "./storage";

/** Storage key for the single settings blob. */
export const SETTINGS_KEY = "igdl_settings";

export interface SettingsServiceOptions {
  /** Custom storage adapter. Defaults to `chromeStorageLocal()`. Tests should inject `inMemoryStorage()`. */
  storage?: KvStorage;
  /** Clock injection for deterministic `addedAt` / `lastEditedAt` timestamps in tests. */
  now?: () => number;
}

/** Fields a caller supplies when adding a profile directory. Service fills the timestamps + counters. */
export interface AddProfileInput {
  username: string;
  directory: string;
}

/** Fields a caller can edit on an existing profile directory row. */
export interface UpdateProfileInput {
  /** New username. If omitted, the existing username is kept. */
  username?: string;
  /** New directory. If omitted, the existing directory is kept. */
  directory?: string;
}

export interface SettingsService {
  /**
   * Returns the current settings, normalized through the schema migration.
   * If storage has no prior blob, returns a fresh copy of SETTINGS_DEFAULTS.
   *
   * @example
   * const settings = await service.get();
   * console.log(settings.theme); // "system"
   */
  get(): Promise<Settings>;

  /**
   * Replaces the entire settings blob. Pass a fully-valid Settings; the
   * schema is re-normalized on the way in to defend against hand-edited input.
   *
   * @example
   * await service.set({ ...currentSettings, theme: "dark" });
   */
  set(settings: Settings): Promise<void>;

  /**
   * Merges a partial update into the current settings and persists the result.
   * Returns the new settings.
   *
   * @example
   * const updated = await service.patch({ theme: "light", enableThreadsSupport: false });
   */
  patch(partial: Partial<Settings>): Promise<Settings>;

  /**
   * Adds a profile directory entry. Username is lowercased + trimmed;
   * `addedAt` and `lastEditedAt` stamp to now; `downloadCount = 0`, `lastDownloadAt = null`.
   * Throws if the username already exists in `profileDirectories`.
   *
   * @example
   * await service.addProfile({ username: "Alice", directory: "instagram/alice" });
   */
  addProfile(input: AddProfileInput): Promise<ProfileDirEntry>;

  /**
   * Edits an existing profile row. Updates `lastEditedAt` to now. If the
   * username is changed, the new username must not already exist in
   * `profileDirectories`. Throws if the target username isn't found.
   *
   * @example
   * await service.updateProfile("alice", { directory: "ig/alice-new" });
   */
  updateProfile(username: string, fields: UpdateProfileInput): Promise<ProfileDirEntry>;

  /**
   * Removes a profile directory row. No-op if the username isn't present.
   *
   * @example
   * await service.deleteProfile("alice");
   */
  deleteProfile(username: string): Promise<void>;

  /**
   * Records a successful download for the given profile. Increments
   * `downloadCount` and updates `lastDownloadAt`. No-op if the profile has
   * no row (i.e., the user downloaded to the default directory).
   *
   * @example
   * await service.incrementDownload("alice");
   */
  incrementDownload(username: string): Promise<void>;

  /**
   * Persists the active sort for the Profile Directories table. The table
   * reads this back via the Settings snapshot and applies it to rows after
   * search filtering, so results always respect the user's chosen sort.
   *
   * @example
   * await service.setProfileDirectoriesSort({ key: "username", direction: "asc" });
   */
  setProfileDirectoriesSort(sort: ProfileDirectoriesSort): Promise<void>;

  /**
   * Adds a profile to the never-ask list. If the profile had a directory row,
   * the row is preserved — opt-out and directory config are orthogonal.
   *
   * @example
   * await service.addNeverAsk("bob");
   */
  addNeverAsk(username: string): Promise<void>;

  /**
   * Removes a profile from the never-ask list. Called by NeverAskCard's remove
   * button. No-op if the profile isn't in the list.
   *
   * @example
   * await service.removeNeverAsk("bob");
   */
  removeNeverAsk(username: string): Promise<void>;

  /**
   * Wipes all settings and restores SETTINGS_DEFAULTS. Profile directories,
   * never-ask list, and every toggle reset.
   *
   * @example
   * await service.resetAll();
   */
  resetAll(): Promise<void>;

  /**
   * Subscribes to settings-changed events. Listener is fired whenever the
   * settings blob changes in storage, including changes made from other
   * contexts (options page ↔ content script ↔ background). Returns an
   * unsubscribe function.
   *
   * @example
   * const off = service.subscribe((settings) => console.log(settings.theme));
   * off();
   */
  subscribe(listener: (settings: Settings) => void): () => void;
}

/**
 * Creates a SettingsService backed by `chrome.storage.local`. Tests should
 * pass a custom `storage` adapter (e.g. `inMemoryStorage()`).
 *
 * @example
 * const service = createSettingsService();
 * await service.patch({ theme: "dark" });
 */
export function createSettingsService(options: SettingsServiceOptions = {}): SettingsService {
  const storage = options.storage ?? chromeStorageLocal();
  const now = options.now ?? Date.now;

  async function load(): Promise<Settings> {
    const raw = await storage.get<unknown>(SETTINGS_KEY);
    if (raw === undefined) return { ...SETTINGS_DEFAULTS };
    return migrate(raw);
  }

  async function save(settings: Settings): Promise<Settings> {
    const normalized = normalize(settings);
    await storage.set(SETTINGS_KEY, normalized);
    return normalized;
  }

  function normalizeUsername(raw: string): string {
    return raw.trim().toLowerCase();
  }

  return {
    async get() {
      return load();
    },

    async set(settings) {
      await save(settings);
    },

    async patch(partial) {
      const current = await load();
      const merged: Settings = { ...current, ...partial, schemaVersion: 1 };
      return save(merged);
    },

    async addProfile(input) {
      const username = normalizeUsername(input.username);
      if (!username) throw new Error("addProfile: username cannot be empty");

      const current = await load();
      if (current.profileDirectories.some((p) => p.username === username)) {
        throw new Error(`addProfile: profile "${username}" already exists`);
      }

      const timestamp = now();
      const entry: ProfileDirEntry = {
        username,
        directory: input.directory,
        downloadCount: 0,
        lastDownloadAt: null,
        addedAt: timestamp,
        lastEditedAt: timestamp,
      };
      const next: Settings = {
        ...current,
        profileDirectories: [...current.profileDirectories, entry],
      };
      await save(next);
      return entry;
    },

    async updateProfile(username, fields) {
      const target = normalizeUsername(username);
      const current = await load();
      const index = current.profileDirectories.findIndex((p) => p.username === target);
      if (index === -1) {
        throw new Error(`updateProfile: profile "${target}" not found`);
      }

      const existing = current.profileDirectories[index];
      const nextUsername =
        fields.username !== undefined ? normalizeUsername(fields.username) : existing.username;
      if (!nextUsername) throw new Error("updateProfile: username cannot be empty");
      if (
        nextUsername !== existing.username &&
        current.profileDirectories.some((p) => p.username === nextUsername)
      ) {
        throw new Error(`updateProfile: profile "${nextUsername}" already exists`);
      }

      const updated: ProfileDirEntry = {
        ...existing,
        username: nextUsername,
        directory: fields.directory !== undefined ? fields.directory : existing.directory,
        lastEditedAt: now(),
      };
      const nextList = [...current.profileDirectories];
      nextList[index] = updated;
      await save({ ...current, profileDirectories: nextList });
      return updated;
    },

    async deleteProfile(username) {
      const target = normalizeUsername(username);
      const current = await load();
      const nextList = current.profileDirectories.filter((p) => p.username !== target);
      if (nextList.length === current.profileDirectories.length) return; // no-op
      await save({ ...current, profileDirectories: nextList });
    },

    async incrementDownload(username) {
      const target = normalizeUsername(username);
      const current = await load();
      const index = current.profileDirectories.findIndex((p) => p.username === target);
      if (index === -1) return; // profile not configured; no-op

      const updated: ProfileDirEntry = {
        ...current.profileDirectories[index],
        downloadCount: current.profileDirectories[index].downloadCount + 1,
        lastDownloadAt: now(),
      };
      const nextList = [...current.profileDirectories];
      nextList[index] = updated;
      await save({ ...current, profileDirectories: nextList });
    },

    async setProfileDirectoriesSort(sort) {
      const current = await load();
      await save({ ...current, profileDirectoriesSort: sort });
    },

    async addNeverAsk(username) {
      const target = normalizeUsername(username);
      if (!target) throw new Error("addNeverAsk: username cannot be empty");

      const current = await load();
      if (current.neverAskProfiles.some((e) => e.username === target)) return; // idempotent

      const entry: NeverAskEntry = { username: target, addedAt: now() };
      await save({
        ...current,
        neverAskProfiles: [...current.neverAskProfiles, entry],
      });
    },

    async removeNeverAsk(username) {
      const target = normalizeUsername(username);
      const current = await load();
      const nextList = current.neverAskProfiles.filter((e) => e.username !== target);
      if (nextList.length === current.neverAskProfiles.length) return; // no-op
      await save({ ...current, neverAskProfiles: nextList });
    },

    async resetAll() {
      await save({ ...SETTINGS_DEFAULTS });
    },

    subscribe(listener) {
      return storage.onChanged((changes) => {
        if (!(SETTINGS_KEY in changes)) return;
        const { newValue } = changes[SETTINGS_KEY];
        listener(newValue === undefined ? { ...SETTINGS_DEFAULTS } : migrate(newValue));
      });
    },
  };
}
