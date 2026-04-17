/**
 * Selectors ported from the reference extension. Instagram's frontend drifts;
 * these are best-effort starting points validated in smoke testing.
 *
 * The reference extension identifies action rows on feed posts/reels by the
 * presence of specific SVG `path` `d` attributes. Copying those verbatim keeps
 * parity with the reference and survives Instagram reshuffling container class
 * names.
 */

/** `<path d="…">` attribute value for Instagram's Like icon (heart). */
export const LIKE_ICON_PATH =
  "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z";

/** `<path d="…">` for Instagram's Comment icon. */
export const COMMENT_ICON_PATH =
  "M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z";

/** `<path d="…">` for Instagram's Share (paper-plane) icon. */
export const SHARE_ICON_PATH =
  "m22.91 2.388-.31-.083-.039-.015a1.307 1.307 0 0 0-.375-.042.965.965 0 0 0-.277.042l-19.75 7a1 1 0 0 0-.064 1.869l6.19 2.583a1.995 1.995 0 0 1 1.078 1.078l2.583 6.195a.994.994 0 0 0 .915.61h.045a.994.994 0 0 0 .905-.673l7-19.75a.903.903 0 0 0 .021-.074l.005-.019a.958.958 0 0 0 .039-.345.946.946 0 0 0-.043-.274 1.2 1.2 0 0 0-.043-.091l-.015-.039-.081-.306ZM13 19.307l-2.32-5.556a3.988 3.988 0 0 0-2.172-2.173L3 9.341 19.26 3.59 13 19.307Z";

/** `<path d="…">` for the video-cover triangular badge on profile grids. */
export const VIDEO_SVG_PATH = "M20 1.5H4A2.5 2.5 0 0 0 1.5 4v16A2.5 2.5 0 0 0 4 22.5h16a2.5 2.5 0 0 0 2.5-2.5V4A2.5 2.5 0 0 0 20 1.5Z";

/** CSS selector that matches an SVG whose primary path equals the Like icon. */
export const likeIconSelector = `svg path[d="${LIKE_ICON_PATH}"]`;
export const commentIconSelector = `svg path[d="${COMMENT_ICON_PATH}"]`;
export const shareIconSelector = `svg path[d="${SHARE_ICON_PATH}"]`;

/** Route predicates keyed off `window.location`. */
export function isPostDetail(pathname: string): boolean {
  return /^\/p\/[^/]+\/?$/.test(pathname);
}
export function isReelDetail(pathname: string): boolean {
  return /^\/reel\/[^/]+\/?$/.test(pathname);
}
export function isReelsFeed(pathname: string): boolean {
  return pathname === "/reels/" || pathname.startsWith("/reels/");
}
export function isStoriesRoute(pathname: string): boolean {
  return pathname.startsWith("/stories/");
}
export function isHighlightsRoute(pathname: string): boolean {
  return pathname.startsWith("/stories/highlights/");
}
export function isExplore(pathname: string): boolean {
  return pathname.startsWith("/explore/");
}
