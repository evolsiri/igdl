import { describe, expect, it } from "vitest";
import { isReelRoute } from "../selectors";

describe("isReelRoute", () => {
  it.each(["/reel/DAbc123/", "/reel/DAbc123", "/reels/DAbc123/", "/alice/reel/DAbc123/"])(
    "is true on %s — a page showing one reel",
    (pathname) => {
      expect(isReelRoute(pathname)).toBe(true);
    },
  );

  it.each([
    ["the feed root", "/reels/"],
    ["a profile's reels tab", "/alice/reels/"],
    ["an audio page", "/reels/audio/1234567890/"],
    ["a post permalink", "/p/DAbc123/"],
    ["a named post permalink", "/alice/p/DAbc123/"],
    ["a profile", "/alice/"],
    ["the home feed", "/"],
    ["stories", "/stories/alice/123/"],
  ])("is false on %s (%s)", (_label, pathname) => {
    expect(isReelRoute(pathname)).toBe(false);
  });
});
