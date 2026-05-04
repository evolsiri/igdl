import type { Dayjs } from "dayjs";
import type { MediaType } from "../../types/instagram";

export interface DownloadParams {
  url: string;
  username?: string;
  datetime?: string | null | Dayjs | number;
  id?: string;
  index?: number;
  type?: MediaType;
}

/**
 * Extracts the filename stem (no extension) from an Instagram media URL.
 *
 * `data:` URLs return `""` so the caller's timestamp fallback fires —
 * `getMediaName` on a base64 payload would otherwise return a chunk of the
 * encoded data. Callers that converted a blob to a data URL should preserve
 * the original blob URL and pass *that* here so the filename keeps a stable
 * UUID-derived id.
 *
 * @example
 * getMediaName("https://cdn.example.com/abc123.jpg");        // → "abc123"
 * getMediaName("blob:https://www.instagram.com/uuid-9000");  // → "uuid-9000"
 * getMediaName("data:video/mp4;base64,AAAA");                // → "" (caller falls back)
 */
export function getMediaName(url: string): string {
  if (url.startsWith("data:")) return "";
  try {
    const urlObj = new URL(url);
    const pathnameArr = urlObj.pathname.split("/");
    const filename = pathnameArr[pathnameArr.length - 1];
    const filenameArr = filename.split(".");
    return filenameArr[0];
  } catch {
    return "";
  }
}

/** Short, deterministic hash used when the Instagram id overflows FS limits. */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash >>> 0;
}

/** MIME → extension lookup for `data:` URL inference. */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "application/zip": "zip",
};

/**
 * Best-effort extension inference from a media URL. Recognizes:
 *   - HTTPS / http URLs: parses pathname for `.<ext>`.
 *   - `data:` URLs: reads MIME type from the header (e.g. `data:video/mp4;...`).
 *   - `blob:` URLs: cannot be inferred (caller should have converted to a
 *     data URL first; defensive default `"jpg"`).
 *
 * Falls back to `"jpg"` when nothing matches.
 *
 * @example
 * inferExtension("https://cdn.example.com/x.mp4");      // → "mp4"
 * inferExtension("data:video/mp4;base64,AAAA");         // → "mp4"
 * inferExtension("data:image/png;base64,iVBORw0KGgo="); // → "png"
 * inferExtension("https://cdn.example.com/no-ext");     // → "jpg" (fallback)
 */
export function inferExtension(url: string): string {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)/);
    if (match) {
      const ext = MIME_TO_EXT[match[1].toLowerCase()];
      if (ext) return ext;
    }
    return "jpg";
  }
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)$/);
    if (match) {
      const ext = match[1];
      if (
        ["jpg", "jpeg", "png", "webp", "gif", "heic", "mp4", "mov", "webm", "m4v"].includes(ext)
      ) {
        return ext;
      }
    }
  } catch {
    /* fall through */
  }
  return "jpg";
}
