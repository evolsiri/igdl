import dayjs from "dayjs";
import { createDownloadService } from "../services/DownloadService";
import { createSettingsService } from "../services/SettingsService";
import { createToastService } from "../services/ToastService";
import type { MediaResource, MediaType } from "../types/instagram";
import { handleDownloadClick, type DownloadFlowDeps } from "./flow/download";
import type { DownloadParams } from "./extractors/filename";
import { inferExtension } from "./extractors/filename";
import { createShadowMount, type ShadowMount } from "./modals/mount";

/**
 * Bridges the reference's `DownloadParams`-shaped handler output into our
 * per-profile-directory download flow (NoDirPopup, toast, chrome.downloads).
 *
 * Services are created lazily on first use so non-extension environments
 * (tests, options preview) don't trip `chrome.storage.local` access when
 * button.ts / content/index.ts are imported transitively.
 */

let cached: DownloadFlowDeps | null = null;

let _prewarmedMount: ShadowMount | null = null;

export function prewarmModalMount(): void {
  if (!_prewarmedMount) _prewarmedMount = createShadowMount();
}

function modalMountFactory(): ShadowMount {
  const m = _prewarmedMount ?? createShadowMount();
  _prewarmedMount = null;
  const reprewarm = () => { _prewarmedMount = createShadowMount(); };
  const g = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (typeof g.requestIdleCallback === "function") {
    g.requestIdleCallback(reprewarm);
  } else {
    setTimeout(reprewarm, 0);
  }
  return m;
}

function getFlowDeps(): DownloadFlowDeps {
  if (!cached) {
    cached = {
      settings: createSettingsService(),
      download: createDownloadService(),
      toast: createToastService(),
      mountFactory: modalMountFactory,
    };
  }
  return cached;
}

function referenceTypeToCanonical(t: string | undefined): MediaType {
  switch (t) {
    case "POST":
      return "post";
    case "REEL":
      return "reel";
    case "STOR":
      return "story";
    case "HGHT":
      return "highlight";
    case "THRD":
      return "threads";
    default:
      return "post";
  }
}

/**
 * Converts reference-shaped download params into our canonical MediaResource
 * and routes through `handleDownloadClick`.
 */
export async function downloadViaFlow(params: DownloadParams, saveAs = false): Promise<void> {
  const datetime = params.datetime ? dayjs(params.datetime as string | number) : dayjs();
  const username = params.username?.trim() || "instagram";
  const id = params.id || dayjs(datetime).format("YYYYMMDD_HHmmss");
  const resource: MediaResource = {
    url: params.url,
    id,
    type: referenceTypeToCanonical(params.type),
    username,
    index: params.index,
    extension: inferExtension(params.url),
    isVideo: /\.mp4($|\?)|video/i.test(params.url),
  };
  if (saveAs) {
    const deps = getFlowDeps();
    const result = await deps.download.queue(resource, { saveAs: true });
    if (!result.ok) deps.toast.failure(`Download failed: ${result.error}`);
    return;
  }
  await handleDownloadClick([resource], getFlowDeps());
}

/** Failure toast for extraction errors that can't produce a MediaResource. */
export function reportFailure(message: string): void {
  getFlowDeps().toast.failure(message);
}

/** Success toast (reserved; currently not used externally). */
export function reportSuccess(message: string): void {
  getFlowDeps().toast.success(message);
}
