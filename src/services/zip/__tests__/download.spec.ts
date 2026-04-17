import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerAnchorDownload } from "../download";

describe("triggerAnchorDownload", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let originalCreate: typeof URL.createObjectURL;
  let originalRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    createObjectURL = vi.fn(() => "blob:mock-url");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.useRealTimers();
  });

  it("creates an anchor with the download attribute and blob URL, then clicks it", () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const blob = new Blob(["zip-content"], { type: "application/zip" });

    triggerAnchorDownload(blob, "alice-ABC.zip");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const appended = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(appended.tagName).toBe("A");
    expect(appended.getAttribute("href")).toBe("blob:mock-url");
    expect(appended.getAttribute("download")).toBe("alice-ABC.zip");
  });

  it("removes the anchor from the DOM synchronously after clicking", () => {
    const blob = new Blob(["x"]);
    triggerAnchorDownload(blob, "f.zip");
    // No stray anchors should remain.
    expect(document.querySelectorAll('a[download="f.zip"]').length).toBe(0);
  });

  it("revokes the object URL after 100ms", () => {
    const blob = new Blob(["x"]);
    triggerAnchorDownload(blob, "f.zip");

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("handles a zero-byte blob without throwing", () => {
    const blob = new Blob([]);
    expect(() => triggerAnchorDownload(blob, "empty.zip")).not.toThrow();
    vi.advanceTimersByTime(100);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
