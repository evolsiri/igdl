/**
 * Instagram / Threads media type enum and the canonical MediaResource shape
 * used everywhere URL resolution meets download invocation.
 */

export type MediaType = "post" | "reel" | "story" | "highlight" | "avatar" | "threads";

/**
 * A single downloadable resource resolved by `MediaCacheService.resolveMediaFor*`
 * and consumed by `DownloadService`. The cartesian product of (post × carousel item)
 * produces N resources for a single user click on an N-item carousel.
 */
export interface MediaResource {
  /** Final downloadable URL. Instagram signs most URLs and they expire on the order of minutes to hours. */
  url: string;
  /** Instagram media id — interpolated into the filename via the `{id}` placeholder. */
  id: string;
  /** Which Instagram surface this resource came from; drives filename `{type}` and directory routing. */
  type: MediaType;
  /** Author username — drives per-profile directory lookup + `{username}` in filenames. */
  username: string;
  /** 1-based position in a carousel. Omitted for single-item resources. */
  index?: number;
  /** Lowercase file extension without the dot (`"jpg"`, `"mp4"`). */
  extension: string;
  /** True if the resource is a video; lets callers branch on muting / controls behavior. */
  isVideo: boolean;
  /**
   * The reel's VP9 rendition, set only when the user opted in and Instagram
   * publishes one. The background remuxes it into a single MP4 and downloads
   * that instead of `url`, which stays the fallback if the remux fails.
   */
  vp9?: DashRendition;
}

/**
 * One rendition from Instagram's DASH manifest. DASH serves video and audio as
 * separate single-track files, so a playable download needs both remuxed into
 * one container (see `RemuxService`).
 */
export interface DashRendition {
  /** HTTPS URL of the video-only stream. */
  videoUrl: string;
  /** HTTPS URL of the audio-only stream. Omitted for reels that have no audio track. */
  audioUrl?: string;
}
