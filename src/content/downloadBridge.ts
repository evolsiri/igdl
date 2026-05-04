import dayjs from "dayjs";
import { createDownloadService } from "../services/download/download";
import { createSettingsService } from "../services/settings/settings";
import { createToastService } from "../services/toast/toast";
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
  setTimeout(reprewarm, 0);
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

export function referenceTypeToCanonical(t: string | undefined): MediaType {
  switch ((t ?? "").toLowerCase()) {
    case "post":
      return "post";
    case "reel":
      return "reel";
    case "stor":
    case "story":
      return "story";
    case "hght":
    case "highlight":
      return "highlight";
    case "thrd":
    case "threads":
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

/**
 * Persistent loading toast — shown while we wait for asynchronous data
 * (e.g. Instagram's XHR populating the storage cache after a SPA story
 * navigation). Does NOT auto-dismiss — call the returned function once
 * the wait completes or times out.
 *
 * @example
 * const dismiss = reportLoading("Loading story data…");
 * try { await waitForData(); } finally { dismiss(); }
 */
export function reportLoading(message: string): () => void {
  return getFlowDeps().toast.loading(message);
}
