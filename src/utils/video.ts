/**
 * Video helpers used by the stories/reels handlers and the `/explore/` page.
 * Handlers toggle installation based on `settings.enableVideoControls` and
 * `settings.enableExploreVideoClickthrough`.
 */

const ENHANCED_SENTINEL = "data-igdl-enhanced";
const EXPLORE_SENTINEL = "data-igdl-explore";

/**
 * Adds native HTML5 `controls` to a video and a volume-change listener that
 * keeps Instagram's mute toggle in sync. Idempotent per element.
 */
export function installVideoControls(video: HTMLVideoElement): void {
  if (video.hasAttribute(ENHANCED_SENTINEL)) return;
  video.setAttribute(ENHANCED_SENTINEL, "");
  video.controls = true;
  video.addEventListener("volumechange", () => {
    // Reference extension uses this hook to sync the page-level mute UI.
    // TODO: wire up the DOM-finding logic for Instagram's mute toggle.
  });
}

/**
 * On `/explore/` pages, wrap video clicks so they navigate to the post.
 * Idempotent per element. Safe to call every poll tick.
 */
export function installExploreClickthrough(video: HTMLVideoElement): void {
  if (video.hasAttribute(EXPLORE_SENTINEL)) return;
  video.setAttribute(EXPLORE_SENTINEL, "");
  video.addEventListener("click", (event) => {
    const anchor = (event.currentTarget as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (anchor) {
      event.preventDefault();
      anchor.click();
    }
  });
}
