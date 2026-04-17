import type { MediaResource } from "../../types/instagram";
import type { Settings } from "../../types/settings";
import { formatDate } from "../../utils/date";
import { joinPath, sanitizeFilename } from "../../utils/path";

/**
 * Interpolates the filename template with resource + settings + clock-value.
 * Applies the `.jpeg → .jpg` normalization and the carousel indexing suffix
 * when enabled. Strips leading/trailing separators left behind by empty
 * placeholders (e.g. when `enableDatetimeFormat` is false).
 *
 * @example
 * buildFilename(
 *   { username: "alice", id: "ABC", type: "post", extension: "jpeg",
 *     url: "https://…", isVideo: false, index: 2 },
 *   { ...SETTINGS_DEFAULTS, filenameTemplate: "{username}-{id}-{datetime}" },
 *   new Date("2026-04-16T15:07:42"),
 * );
 * // → "alice-ABC-20260416_150742_2.jpg"
 */
export function buildFilename(
  resource: MediaResource,
  settings: Settings,
  now: Date = new Date(),
): string {
  let name = settings.filenameTemplate;
  name = name.replace(/\{username\}/g, resource.username);
  name = name.replace(/\{id\}/g, resource.id);
  name = name.replace(/\{type\}/g, resource.type);
  name = name.replace(
    /\{datetime\}/g,
    settings.enableDatetimeFormat ? formatDate(now, settings.datetimeFormat) : "",
  );
  // Strip separators left behind by empty placeholders.
  name = name.replace(/^[-_.\s]+|[-_.\s]+$/g, "");
  // Collapse repeated separators that appear when two placeholders are blank.
  name = name.replace(/([-_])\1+/g, "$1");
  name = sanitizeFilename(name);

  if (resource.index !== undefined && settings.useCarouselIndexing) {
    name = `${name}_${resource.index}`;
  }

  let ext = resource.extension.toLowerCase().replace(/^\./, "");
  if (settings.replaceJpegWithJpg && ext === "jpeg") ext = "jpg";

  return `${name}.${ext}`;
}

/**
 * Returns the directory for the given author's username. Uses the profile's
 * configured directory when present (case-insensitive match), else the global
 * default directory. Never includes a trailing slash.
 *
 * @example
 * resolveDirectory("alice", settings); // → "instagram/alice"
 * resolveDirectory("nobody", settings); // → settings.defaultDownloadDirectory
 */
export function resolveDirectory(username: string, settings: Settings): string {
  const normalized = username.trim().toLowerCase();
  const match = settings.profileDirectories.find((p) => p.username === normalized);
  return match?.directory || settings.defaultDownloadDirectory;
}

/**
 * Combines `resolveDirectory` + `buildFilename` into the final relative path
 * suitable for `chrome.downloads.download`'s `filename` field (relative to
 * the browser's Downloads folder).
 *
 * @example
 * buildFullPath(resource, settings); // → "instagram/alice/alice-ABC-20260416_150742.jpg"
 */
export function buildFullPath(
  resource: MediaResource,
  settings: Settings,
  now: Date = new Date(),
): string {
  return joinPath(resolveDirectory(resource.username, settings), buildFilename(resource, settings, now));
}
