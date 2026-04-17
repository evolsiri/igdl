/**
 * Settings v1 — the single user-facing blob persisted at
 * `chrome.storage.local["igdl_settings"]`. Schema version is pinned at 1;
 * future changes bump the version and add a forward migration in
 * `SettingsService/schema.ts`.
 */

export type ThemeSetting = "system" | "light" | "dark";

export interface Settings {
  schemaVersion: 1;
  theme: ThemeSetting;

  // Downloads
  defaultDownloadDirectory: string;
  baseDirectory: string;
  prefix: string;
  alwaysPromptSaveAs: boolean;
  filenameTemplate: string;
  datetimeFormat: string;
  enableDatetimeFormat: boolean;
  replaceJpegWithJpg: boolean;
  useCarouselIndexing: boolean;
  showOpenInNewTabIcon: boolean;
  showZipDownloadIcon: boolean;
  enableThreadsSupport: boolean;
  enableVideoControls: boolean;
  enableExploreVideoClickthrough: boolean;

  // Profile Directories
  profileDirectories: ProfileDirEntry[];
  profileDirectoriesSort: ProfileDirectoriesSort;

  // Never-Ask Profiles
  neverAskProfiles: NeverAskEntry[];
}

/** Columns the Profile Directories table can be sorted by. Closed union. */
export type ProfileDirectoriesSortKey =
  | "username"
  | "directory"
  | "downloadCount"
  | "lastDownloadAt"
  | "addedAt";

export type SortDirection = "asc" | "desc";

export interface ProfileDirectoriesSort {
  key: ProfileDirectoriesSortKey;
  direction: SortDirection;
}

/**
 * Default sort for the Profile Directories table: most-recently-added first.
 * Clicking an already-active sort arrow reverts the table to this.
 */
export const PROFILE_DIRECTORIES_DEFAULT_SORT: ProfileDirectoriesSort = {
  key: "addedAt",
  direction: "desc",
};

export interface ProfileDirEntry {
  username: string;
  directory: string;
  downloadCount: number;
  /** Epoch ms; `null` means no downloads have completed yet for this profile. */
  lastDownloadAt: number | null;
  /** Epoch ms. */
  addedAt: number;
  /** Epoch ms. */
  lastEditedAt: number;
}

export interface NeverAskEntry {
  username: string;
  /** Epoch ms. */
  addedAt: number;
}
