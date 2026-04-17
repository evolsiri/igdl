import type { MediaResource } from "../types/instagram";

/**
 * Chrome-only content-script ZIP builder. Signature-only stub — `zip.js`
 * integration is not yet implemented. On Firefox the background handler in
 * `background/firefox.ts` does the work because Firefox content scripts
 * can't construct `BlobWriter`.
 */
export async function buildCarouselZip(
  _resources: MediaResource[],
  _baseFilename: string,
): Promise<Blob> {
  // TODO: dynamic-import zip.js, fetch each resource URL, add it to a
  // BlobWriter with a zero-padded index prefix, close the writer, return
  // the result blob.
  throw new Error("buildCarouselZip: not implemented");
}
