import { describe, expect, it } from "vitest";
import { getMediaName, inferExtension } from "../filename";

describe("inferExtension — data: URLs", () => {
  it("returns 'mp4' for video/mp4", () => {
    expect(inferExtension("data:video/mp4;base64,abc")).toBe("mp4");
  });

  it("returns 'jpg' for image/jpeg", () => {
    expect(inferExtension("data:image/jpeg;base64,abc")).toBe("jpg");
  });

  it("returns 'webm' for video/webm", () => {
    expect(inferExtension("data:video/webm;base64,abc")).toBe("webm");
  });

  it("returns 'png' for image/png", () => {
    expect(inferExtension("data:image/png;base64,abc")).toBe("png");
  });

  it("returns 'zip' for application/zip", () => {
    expect(inferExtension("data:application/zip;base64,abc")).toBe("zip");
  });

  it("falls back to 'jpg' for an unknown MIME data URL", () => {
    expect(inferExtension("data:application/x-unknown;base64,abc")).toBe("jpg");
  });

  it("falls back to 'jpg' for a malformed data URL", () => {
    expect(inferExtension("data:not-a-mime")).toBe("jpg");
  });
});

describe("inferExtension — HTTPS URLs", () => {
  it("preserves pathname-based extraction for .mp4", () => {
    expect(inferExtension("https://cdn.example.com/x.mp4")).toBe("mp4");
  });

  it("preserves pathname-based extraction with query string", () => {
    expect(inferExtension("https://cdn.example.com/x.jpg?sig=1")).toBe("jpg");
  });

  it("falls back to 'jpg' for URLs without a recognized extension", () => {
    expect(inferExtension("https://cdn.example.com/x")).toBe("jpg");
  });

  it("ignores unknown extensions and falls back to 'jpg'", () => {
    expect(inferExtension("https://cdn.example.com/x.txt")).toBe("jpg");
  });
});

describe("getMediaName", () => {
  it("returns the filename stem from an HTTPS URL", () => {
    expect(getMediaName("https://cdn.example.com/abc.jpg")).toBe("abc");
  });

  it("returns the UUID stem from a blob URL", () => {
    expect(getMediaName("blob:https://www.instagram.com/uuid-123")).toBe("uuid-123");
  });

  it("returns empty string for a data: URL so the caller's timestamp fallback fires", () => {
    expect(getMediaName("data:video/mp4;base64,AAAA")).toBe("");
  });

  it("returns empty string for an unparseable URL", () => {
    expect(getMediaName("not-a-url")).toBe("");
  });
});
