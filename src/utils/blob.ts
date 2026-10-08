/**
 * Converts a `Blob` to a base64 data URL via `FileReader`. A data URL is how
 * an in-memory file is handed to a context that cannot read the blob itself:
 *
 *  - Content scripts use it before a download crosses to the background —
 *    `blob:` URLs are scoped to the document that minted them (see
 *    `docs/services/download.md` and `docs/services/zip.md`).
 *  - Chrome's service worker uses it for the remuxed VP9 file, because it has
 *    no `URL.createObjectURL` to mint a `blob:` URL of its own.
 *
 * @example
 * const dataUrl = await blobToDataUrl(new Blob(["x"], { type: "video/mp4" }));
 * // → "data:video/mp4;base64,eA=="
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
