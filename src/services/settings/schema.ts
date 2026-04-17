import type {
  NeverAskEntry,
  ProfileDirectoriesSort,
  ProfileDirectoriesSortKey,
  ProfileDirEntry,
  Settings,
  SortDirection,
  ThemeSetting,
} from "../../types/settings";
import { PROFILE_DIRECTORIES_DEFAULT_SORT } from "../../types/settings";

/**
 * v1 default Settings blob. `SettingsService.resetAll()` writes this verbatim.
 * Change via a schema migration, not by editing this object after v1 ships.
 */
export const SETTINGS_DEFAULTS: Settings = {
  schemaVersion: 1,
  theme: "system",
  defaultDownloadDirectory: "instagram",
  baseDirectory: "instagram",
  prefix: "instagram",
  alwaysPromptSaveAs: false,
  filenameTemplate: "{username}-{id}-{datetime}",
  datetimeFormat: "YYYYMMDD_HHmmss",
  enableDatetimeFormat: true,
  replaceJpegWithJpg: true,
  useCarouselIndexing: true,
  showOpenInNewTabIcon: true,
  showZipDownloadIcon: true,
  enableThreadsSupport: true,
  enableVideoControls: true,
  enableExploreVideoClickthrough: false,
  profileDirectories: [],
  profileDirectoriesSort: { ...PROFILE_DIRECTORIES_DEFAULT_SORT },
  neverAskProfiles: [],
};

const CURRENT_SCHEMA_VERSION = 1 as const;
const VALID_THEMES: readonly ThemeSetting[] = ["system", "light", "dark"];
const VALID_SORT_KEYS: readonly ProfileDirectoriesSortKey[] = [
  "username",
  "directory",
  "downloadCount",
  "lastDownloadAt",
  "addedAt",
];
const VALID_SORT_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

/**
 * Strips a value of anything that isn't a valid Settings shape, replacing
 * missing or malformed fields with the corresponding default. Unknown fields
 * from a future version are dropped (forward-only migration policy — lossy
 * downgrades are preferable to carrying unvalidated data).
 *
 * @example
 * normalize(undefined); // → { ...SETTINGS_DEFAULTS }
 * normalize({ theme: "dark", junk: 1 }); // → { ...SETTINGS_DEFAULTS, theme: "dark" }
 */
export function normalize(input: unknown): Settings {
  if (!isRecord(input)) return { ...SETTINGS_DEFAULTS };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    theme: pickEnum(input.theme, VALID_THEMES, SETTINGS_DEFAULTS.theme),
    defaultDownloadDirectory: pickString(
      input.defaultDownloadDirectory,
      SETTINGS_DEFAULTS.defaultDownloadDirectory,
    ),
    baseDirectory: pickString(input.baseDirectory, SETTINGS_DEFAULTS.baseDirectory),
    prefix: pickString(input.prefix, SETTINGS_DEFAULTS.prefix),
    alwaysPromptSaveAs: pickBool(input.alwaysPromptSaveAs, SETTINGS_DEFAULTS.alwaysPromptSaveAs),
    filenameTemplate: pickString(input.filenameTemplate, SETTINGS_DEFAULTS.filenameTemplate),
    datetimeFormat: pickString(input.datetimeFormat, SETTINGS_DEFAULTS.datetimeFormat),
    enableDatetimeFormat: pickBool(
      input.enableDatetimeFormat,
      SETTINGS_DEFAULTS.enableDatetimeFormat,
    ),
    replaceJpegWithJpg: pickBool(input.replaceJpegWithJpg, SETTINGS_DEFAULTS.replaceJpegWithJpg),
    useCarouselIndexing: pickBool(
      input.useCarouselIndexing,
      SETTINGS_DEFAULTS.useCarouselIndexing,
    ),
    showOpenInNewTabIcon: pickBool(
      input.showOpenInNewTabIcon,
      SETTINGS_DEFAULTS.showOpenInNewTabIcon,
    ),
    showZipDownloadIcon: pickBool(
      input.showZipDownloadIcon,
      SETTINGS_DEFAULTS.showZipDownloadIcon,
    ),
    enableThreadsSupport: pickBool(
      input.enableThreadsSupport,
      SETTINGS_DEFAULTS.enableThreadsSupport,
    ),
    enableVideoControls: pickBool(
      input.enableVideoControls,
      SETTINGS_DEFAULTS.enableVideoControls,
    ),
    enableExploreVideoClickthrough: pickBool(
      input.enableExploreVideoClickthrough,
      SETTINGS_DEFAULTS.enableExploreVideoClickthrough,
    ),
    profileDirectories: normalizeProfileDirectories(input.profileDirectories),
    profileDirectoriesSort: normalizeProfileDirectoriesSort(input.profileDirectoriesSort),
    neverAskProfiles: normalizeNeverAskProfiles(input.neverAskProfiles),
  };
}

/**
 * Forward-only migration dispatch. Given a raw loaded blob of any past
 * schemaVersion, returns a fully-valid current-version Settings.
 *
 * Currently no prior versions exist (v1 is the first shipped schema). Future
 * versions add their own `case` branches that mutate an intermediate then
 * fall through to `normalize()` for final validation.
 *
 * @example
 * migrate(undefined); // → SETTINGS_DEFAULTS
 * migrate({ schemaVersion: 1, theme: "dark", ... }); // → normalized v1 blob
 */
export function migrate(input: unknown): Settings {
  if (!isRecord(input)) return { ...SETTINGS_DEFAULTS };

  const version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;

  // Future: add case blocks for older versions here, each upgrading `input`
  // toward v1 shape before falling through to normalize().
  if (version === 0 || version > CURRENT_SCHEMA_VERSION) {
    // Unknown / future schemaVersion: coerce to defaults, keeping any valid-looking fields.
    return normalize(input);
  }

  return normalize(input);
}

// --- Helpers -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function pickNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pickNullableNumber(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function normalizeProfileDirectories(v: unknown): ProfileDirEntry[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: ProfileDirEntry[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) continue;
    const username = pickString(entry.username, "").trim().toLowerCase();
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push({
      username,
      directory: pickString(entry.directory, ""),
      downloadCount: Math.max(0, Math.floor(pickNumber(entry.downloadCount, 0))),
      lastDownloadAt: pickNullableNumber(entry.lastDownloadAt, null),
      addedAt: pickNumber(entry.addedAt, 0),
      lastEditedAt: pickNumber(entry.lastEditedAt, 0),
    });
  }
  return out;
}

function normalizeProfileDirectoriesSort(v: unknown): ProfileDirectoriesSort {
  if (!isRecord(v)) return { ...PROFILE_DIRECTORIES_DEFAULT_SORT };
  return {
    key: pickEnum(v.key, VALID_SORT_KEYS, PROFILE_DIRECTORIES_DEFAULT_SORT.key),
    direction: pickEnum(
      v.direction,
      VALID_SORT_DIRECTIONS,
      PROFILE_DIRECTORIES_DEFAULT_SORT.direction,
    ),
  };
}

function normalizeNeverAskProfiles(v: unknown): NeverAskEntry[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: NeverAskEntry[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) continue;
    const username = pickString(entry.username, "").trim().toLowerCase();
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push({
      username,
      addedAt: pickNumber(entry.addedAt, 0),
    });
  }
  return out;
}
