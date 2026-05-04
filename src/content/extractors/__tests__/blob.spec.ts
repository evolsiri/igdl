import { describe, expect, it, vi } from "vitest";
import { blobToDataUrl, isBlobUrl, resolveBlobUrlToDataUrl } from "../blob";

describe("isBlobUrl", () => {
  it("returns true for blob: URLs", () => {
    expect(isBlobUrl("blob:https://www.instagram.com/abc")).toBe(true);
  });

  it("returns false for HTTPS / data: URLs", () => {
    expect(isBlobUrl("https://cdn.example.com/x.jpg")).toBe(false);
    expect(isBlobUrl("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("returns false for null / undefined / empty", () => {
    expect(isBlobUrl(null)).toBe(false);
    expect(isBlobUrl(undefined)).toBe(false);
    expect(isBlobUrl("")).toBe(false);
  });
});

describe("blobToDataUrl", () => {
  it("encodes a small Blob as a base64 data URL with the right MIME", async () => {
    const blob = new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef])], { type: "image/png" });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    // 4 raw bytes → 8 base64 chars (with padding).
    expect(dataUrl.split(",")[1]).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("preserves type=video/mp4 in the header", async () => {
    const blob = new Blob([new Uint8Array([0])], { type: "video/mp4" });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl.startsWith("data:video/mp4;base64,")).toBe(true);
  });
});

describe("resolveBlobUrlToDataUrl", () => {
  it("returns null on fetch rejection", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("nope"));
    const result = await resolveBlobUrlToDataUrl("blob:https://example.com/x");
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("returns null on non-OK response", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      blob: async () => new Blob([]),
    } as Response);
    const result = await resolveBlobUrlToDataUrl("blob:https://example.com/x");
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("returns a data URL on success with the blob's MIME", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }),
    } as Response);
    const result = await resolveBlobUrlToDataUrl("blob:https://example.com/x");
    expect(result).toMatch(/^data:video\/mp4;base64,/);
    spy.mockRestore();
  });
});
