import { describe, expect, it } from "vitest";
import { blobToDataUrl } from "../blob";

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
