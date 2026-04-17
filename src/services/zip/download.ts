/**
 * Browser-only helper: write a `Blob` to the user's Downloads folder by
 * creating a temporary `<a download>` anchor, clicking it, and revoking the
 * backing object URL after a short delay.
 *
 * Used by the zip flow specifically: `chrome.downloads.download` (our
 * normal path) can't consume a content-script-scoped blob URL because blob
 * URLs are origin-scoped to the context that created them. The anchor-click
 * technique side-steps that by letting the browser itself resolve the URL
 * in the same context it was created.
 *
 * Trade-offs documented in `docs/services/ZipService.md`:
 *   - The file lands in the Downloads folder root (no profile-directory
 *     routing, since DownloadService is not involved).
 *   - The "Always prompt Save As" setting does not apply.
 *   - Cancellation is not observable — the browser handles the download.
 */

/**
 * Downloads `blob` as `filename` via a temporary anchor element. Creates
 * `URL.createObjectURL(blob)`, attaches a hidden `<a href download>`, clicks
 * it, then removes the node and schedules `URL.revokeObjectURL` after 100ms
 * so the browser has time to read the blob before the URL is reclaimed.
 *
 * Side-effects only; returns nothing.
 *
 * @example
 * triggerAnchorDownload(zipBlob, "alice-ABC-20260416_150742.zip");
 */
export function triggerAnchorDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
}
