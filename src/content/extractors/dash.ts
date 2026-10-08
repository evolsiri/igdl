import type { DashRendition } from "../../types/instagram";
import { isInstagramCdnUrl } from "../../utils/instagram-cdn";
import { isReelRoute } from "../selectors";
import { storageCache } from "./storage";

/**
 * Instagram lists every encoding of a video in a DASH manifest — the
 * `video_dash_manifest` XML string on a media item. `video_versions`, which
 * the handlers download by default, only carries the progressive H.264 files;
 * the VP9 encodings exist solely as video-only streams in the manifest, next
 * to a separate audio stream.
 */

interface Stream {
  url: string;
  codecs: string;
  /** The "p" of 1080p: the shorter side, so portrait and landscape rank alike. 0 when unknown. */
  resolution: number;
  bandwidth: number;
}

export interface PickOptions {
  /**
   * Shorter side, in pixels, of the video the VP9 stream would replace. VP9
   * streams known to be smaller are not picked — the point is an upgrade.
   */
  minResolution?: number;
  /**
   * Accept a manifest with no audio stream and return a video-only rendition.
   * Off by default, so a reel that has sound never becomes a silent file.
   */
  allowSilent?: boolean;
}

/**
 * Picks the VP9 rendition out of an Instagram DASH manifest: the
 * highest-resolution VP9 video stream, paired with the best stream of the
 * manifest's first audio track. A manifest with several audio tracks is
 * assumed to list the original first and translated dubs after it — not yet
 * checked against a real dubbed reel. Returns `null`
 * when there is nothing to upgrade to — the manifest is absent or isn't
 * parseable XML, it lists no usable VP9 video, the VP9 video is smaller than
 * `minResolution`, or the audio is missing and `allowSilent` isn't set. The
 * caller then keeps the standard video.
 *
 * @example
 * const vp9 = pickVp9Rendition(item.video_dash_manifest, { minResolution: 720 });
 * // → { videoUrl: "https://scontent.cdninstagram.com/…/vp9-1080p.mp4",
 * //     audioUrl: "https://scontent.cdninstagram.com/…/aac.mp4" }
 * pickVp9Rendition(undefined); // → null
 */
export function pickVp9Rendition(manifest: unknown, options: PickOptions = {}): DashRendition | null {
  if (typeof manifest !== "string" || manifest.trim().length === 0) return null;
  // Parsed into a detached XML document — nothing is inserted into the page.
  // Trimmed first: whitespace ahead of the XML declaration is a parse error.
  const doc = new DOMParser().parseFromString(manifest.trim(), "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const video: Stream[] = [];
  const audio: Stream[] = [];
  let audioTrack: Element | null = null;
  for (const representation of Array.from(doc.getElementsByTagName("Representation"))) {
    const set = representation.parentElement;
    // Attributes common to a whole AdaptationSet may be hoisted onto it.
    const attribute = (name: string): string =>
      representation.getAttribute(name) ?? set?.getAttribute(name) ?? "";
    const kind = attribute("contentType") || attribute("mimeType").split("/")[0];
    // Each audio AdaptationSet is one track. Assume the first is the original
    // and the rest are translations, which must not win just by having a
    // higher bitrate.
    if (kind === "audio") audioTrack ??= set;
    if (kind === "audio" && set !== audioTrack) continue;

    const url = childText(representation, "BaseURL");
    // Only whole files on Instagram's CDN can be fetched; skip segment-addressed streams.
    if (!isInstagramCdnUrl(url) || isSegmented(representation) || isSegmented(set)) continue;

    const stream: Stream = {
      url,
      codecs: attribute("codecs").toLowerCase(),
      resolution: Math.min(Number(attribute("width")) || 0, Number(attribute("height")) || 0),
      bandwidth: Number(attribute("bandwidth")) || 0,
    };
    if (kind === "audio") audio.push(stream);
    else if (kind === "video" && /^vp0?9/.test(stream.codecs)) video.push(stream);
  }

  video.sort((a, b) => b.resolution - a.resolution || b.bandwidth - a.bandwidth);
  audio.sort((a, b) => audioRank(b) - audioRank(a) || b.bandwidth - a.bandwidth);
  const best = video[0];
  if (!best) return null;
  // A VP9 stream of unknown size is still taken: there is nothing to compare.
  if (best.resolution > 0 && best.resolution < (options.minResolution ?? 0)) return null;
  if (audio.length > 0) return { videoUrl: best.url, audioUrl: audio[0].url };
  // No usable audio. Only a reel known to be silent may go without it — and
  // not one whose audio track exists but couldn't be used.
  return options.allowSilent && audioTrack === null ? { videoUrl: best.url } : null;
}

/**
 * Returns the VP9 rendition a download should use for `item` — an Instagram
 * media object from the info API or the reels-feed JSON. `undefined` means
 * "download the standard video": the user hasn't turned on
 * `preferVp9Reels`, the item isn't a reel, or its manifest offers no VP9
 * stream at least as large as the standard video (see `pickVp9Rendition`).
 *
 * @example
 * const res = await getUrlFromInfoApi(articleNode);
 * await downloadViaFlow({ url: res.url, type: "reel", vp9: resolveReelVp9(res) });
 */
export function resolveReelVp9(item: unknown): DashRendition | undefined {
  if (!storageCache.canonical.preferVp9Reels) return undefined;
  if (typeof item !== "object" || item === null) return undefined;
  const media = item as {
    product_type?: unknown;
    video_dash_manifest?: unknown;
    video_versions?: unknown;
    has_audio?: unknown;
  };
  // "clips" is Instagram's product type for reels; it also marks the reels that
  // show up in the home feed and in post dialogs. A payload that omits the
  // field counts as a reel on a reel page. Any other type — a carousel item, a
  // classic feed video — is not one, wherever it is shown.
  const isReel =
    media.product_type === "clips" ||
    (media.product_type == null && isReelRoute(window.location.pathname));
  if (!isReel) return undefined;
  try {
    const rendition = pickVp9Rendition(media.video_dash_manifest, {
      minResolution: standardResolution(media.video_versions),
      allowSilent: media.has_audio === false,
    });
    return rendition ?? undefined;
  } catch (err) {
    // VP9 is an extra. A manifest that trips the picker must not cost the download.
    console.warn("[igdl] could not read the DASH manifest; using the standard video", err);
    return undefined;
  }
}

/** Shorter side of `video_versions[0]`, the file a download uses by default. 0 when unknown. */
function standardResolution(videoVersions: unknown): number {
  const standard: unknown = Array.isArray(videoVersions) ? videoVersions[0] : null;
  if (typeof standard !== "object" || standard === null) return 0;
  const { width, height } = standard as { width?: unknown; height?: unknown };
  return Math.min(Number(width) || 0, Number(height) || 0);
}

function childText(parent: Element, name: string): string {
  const child = Array.from(parent.children).find((el) => el.localName === name);
  return child?.textContent?.trim() ?? "";
}

function isSegmented(element: Element | null): boolean {
  return Array.from(element?.children ?? []).some(
    (el) => el.localName === "SegmentTemplate" || el.localName === "SegmentList",
  );
}

/** AAC plays everywhere; xHE-AAC (`mp4a.40.42`) and non-AAC audio do not, so they rank last. */
function audioRank(stream: Stream): number {
  return stream.codecs.startsWith("mp4a") && stream.codecs !== "mp4a.40.42" ? 1 : 0;
}
