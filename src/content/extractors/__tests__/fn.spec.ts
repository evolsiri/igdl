// @vitest-environment-options { "url": "https://www.instagram.com/" }
// The story lookup reads the full page URL, host included.
import { afterEach, describe, expect, it, vi } from "vitest";
import { findMediaId, findPostId, getDataFromAPI, getUrlFromInfoApi } from "../fn";

function setPath(pathname: string) {
  window.history.replaceState({}, "", pathname);
}

afterEach(() => {
  document.body.innerHTML = "";
  setPath("/");
  vi.restoreAllMocks();
});

describe("findPostId", () => {
  it.each([
    ["/reels/CODE1/", "CODE1"],
    ["/reel/CODE1/", "CODE1"],
    ["/stories/alice/3141592653/", "3141592653"],
    ["/alice/reel/CODE1/", "CODE1"],
  ])("reads the id from the URL on %s", (pathname, expected) => {
    setPath(pathname);
    expect(findPostId(null)).toBe(expected);
  });

  it("uses the URL on /:user/reel/:id even when the page links to other posts", () => {
    // The reel's own links there are /reel/ links; a /p/ link belongs to something else.
    setPath("/alice/reel/CODE1/");
    document.body.innerHTML = '<main><a href="/p/OTHERPOST/">another post</a></main>';
    expect(findPostId(document.querySelector("main"))).toBe("CODE1");
  });

  it("falls back to the first /p/ link inside the article elsewhere", () => {
    setPath("/");
    document.body.innerHTML = '<article><a href="/alice/">alice</a><a href="/p/POST9/">2h</a></article>';
    expect(findPostId(document.querySelector("article"))).toBe("POST9");
    expect(findPostId(null)).toBeNull();
  });
});

describe("getDataFromAPI", () => {
  function mockInstagram(mediaIdByShortcode: Record<string, string>) {
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requested.push(url);
      const page = url.match(/instagram\.com\/p\/([^/]+)\//);
      if (page) return new Response(`{"media_id":"${mediaIdByShortcode[page[1]]}"}`);
      const info = url.match(/\/media\/(\d+)\/info\//);
      if (info) return new Response(JSON.stringify({ items: [{ pk: info[1] }] }));
      return new Response("", { status: 404 });
    });
    return requested;
  }

  function addAppId() {
    const script = document.createElement("script");
    script.type = "application/json";
    script.text = '{"X-IG-App-ID":"936619743392459"}';
    document.body.appendChild(script);
  }

  it("looks up the post named by knownPostId, not the one in the URL", async () => {
    addAppId();
    const requested = mockInstagram({ CLICKED: "111", SCROLLED: "222" });
    // The user clicked CLICKED, then the feed moved on.
    setPath("/reels/SCROLLED/");

    const item = await getDataFromAPI(null, "CLICKED");

    expect(item).toEqual({ pk: "111" });
    expect(requested.some((url) => url.includes("/p/CLICKED/"))).toBe(true);
    expect(requested.some((url) => url.includes("SCROLLED"))).toBe(false);
  });

  it("finds the post from the URL when no id is given", async () => {
    addAppId();
    mockInstagram({ FROMURL: "333" });
    setPath("/reels/FROMURL/");

    expect(await getDataFromAPI(null)).toEqual({ pk: "333" });
  });

  it("looks up the named post even when the page has moved on to a story", async () => {
    addAppId();
    const requested = mockInstagram({ CLICKED2: "444" });
    // Left alone, a story URL supplies its own media id and the shortcode is ignored.
    setPath("/stories/bob/9876543210/");

    const item = await getDataFromAPI(null, "CLICKED2");

    expect(item).toEqual({ pk: "444" });
    expect(requested.some((url) => url.includes("9876543210"))).toBe(false);
  });
});

describe("getUrlFromInfoApi", () => {
  it("passes a known post id through, so the lookup doesn't go by the URL", async () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.text = '{"X-IG-App-ID":"936619743392459"}';
    document.body.appendChild(script);
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/p/CLICKED3/")) return new Response('{"media_id":"555"}');
      if (url.includes("/media/555/info/")) {
        return new Response(
          JSON.stringify({
            items: [{ code: "CLICKED3", owner: { username: "alice" }, video_versions: [{ url: "https://cdn.example.com/v.mp4" }] }],
          }),
        );
      }
      return new Response("", { status: 404 });
    });
    setPath("/reels/SCROLLED3/");

    const res = await getUrlFromInfoApi(null, 0, "CLICKED3");

    expect(res).toEqual(
      expect.objectContaining({ code: "CLICKED3", owner: "alice", url: "https://cdn.example.com/v.mp4" }),
    );
    expect(requested.some((url) => url.includes("SCROLLED3"))).toBe(false);
  });
});

describe("findMediaId", () => {
  it("reads a story's media id from the URL", async () => {
    const fetched = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));
    setPath("/stories/alice/3141592653/");

    expect(await findMediaId("3141592653")).toBe("3141592653");
    expect(fetched).not.toHaveBeenCalled();
  });

  it.each(["../../accounts/logout", "CODE/extra", "CODE?x=1", "", "a b"])(
    "refuses %j instead of putting it in a request path",
    async (postId) => {
      const fetched = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in tests"));

      expect(await findMediaId(postId, true)).toBeNull();
      expect(fetched).not.toHaveBeenCalled();
    },
  );
});
