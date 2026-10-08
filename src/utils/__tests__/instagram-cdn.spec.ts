import { describe, expect, it } from "vitest";
import { isInstagramCdnUrl } from "../instagram-cdn";

describe("isInstagramCdnUrl", () => {
  it.each([
    "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/f2/m69/x.mp4?efg=1&oh=2",
    "https://scontent.cdninstagram.com/v/t51.2885-15/x.jpg",
    "https://instagram.fphx1-1.fna.fbcdn.net/o1/v/t16/x.mp4",
    "https://video.xx.fbcdn.net/v/x.mp4",
    "https://scontent.cdninstagram.com:8443/x.mp4",
  ])("accepts %s", (url) => {
    expect(isInstagramCdnUrl(url)).toBe(true);
  });

  it.each([
    ["plain HTTP", "http://scontent.cdninstagram.com/x.mp4"],
    ["another host", "https://example.com/x.mp4"],
    ["a look-alike suffix", "https://evilcdninstagram.com/x.mp4"],
    ["the CDN name as a subdomain of another host", "https://cdninstagram.com.example.com/x.mp4"],
    ["the CDN name in the path", "https://example.com/scontent.cdninstagram.com/x.mp4"],
    ["the CDN name as userinfo", "https://scontent.cdninstagram.com@example.com/x.mp4"],
    ["credentials in front of a CDN host", "https://user:secret@scontent.cdninstagram.com/x.mp4"],
    ["a user name in front of a CDN host", "https://user@scontent.cdninstagram.com/x.mp4"],
    ["a blob: URL", "blob:https://www.instagram.com/2f1c"],
    ["a data: URL", "data:video/mp4;base64,AAAA"],
    ["a relative path", "segments/x.mp4"],
    ["an empty string", ""],
  ])("rejects %s", (_label, url) => {
    expect(isInstagramCdnUrl(url)).toBe(false);
  });

  it.each([undefined, null, 42, { href: "https://scontent.cdninstagram.com/x.mp4" }])(
    "rejects a non-string (%j)",
    (value) => {
      expect(isInstagramCdnUrl(value)).toBe(false);
    },
  );
});
