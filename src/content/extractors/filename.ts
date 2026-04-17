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

/** Extracts the filename stem (no extension) from an Instagram media URL. */
export function getMediaName(url: string): string {
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

/**
 * Best-effort extension inference from the URL. Falls back to "jpg" for
 * anything that doesn't end in a common image/video suffix.
 */
export function inferExtension(url: string): string {
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
