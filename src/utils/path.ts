/**
 * Characters illegal in filenames across Windows, macOS, and Linux.
 * Windows is the strictest: `< > : " / \ | ? *` plus control chars (0x00-0x1F).
 * `/` is treated as a path separator in `joinPath`, not as part of a filename.
 */
// eslint-disable-next-line no-control-regex -- control chars are intentionally part of this class
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

/**
 * Joins path segments with `/`, collapsing duplicate separators and trimming
 * surrounding whitespace. Empty segments are skipped. The result has no
 * trailing slash; a leading slash is stripped so the output is always a
 * relative path suitable for `chrome.downloads.download`'s `filename` field.
 *
 * @example
 * joinPath("instagram", "alice"); // → "instagram/alice"
 * joinPath("instagram/", "/alice/", "post.jpg"); // → "instagram/alice/post.jpg"
 * joinPath("", "  ", "alice"); // → "alice"
 */
export function joinPath(...segments: string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (typeof segment !== "string") continue;
    const trimmed = segment.trim().replace(/^\/+|\/+$/g, "");
    if (trimmed.length === 0) continue;
    parts.push(trimmed);
  }
  return parts.join("/");
}

/**
 * Replaces characters illegal in filenames across Windows/macOS/Linux with
 * underscores, collapses runs of underscores, and strips leading/trailing dots
 * (Windows rejects files whose name ends in a dot).
 *
 * Intended for individual filename components (no `/`). Use `joinPath` to
 * combine sanitized components into a path.
 *
 * @example
 * sanitizeFilename("alice: post.jpg"); // → "alice_ post.jpg"
 * sanitizeFilename("a/b:c|d"); // → "a_b_c_d"
 * sanitizeFilename(".hidden."); // → "hidden"
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(ILLEGAL_FILENAME_CHARS, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .trim();
}
