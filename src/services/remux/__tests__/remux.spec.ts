import { describe, expect, it, vi } from "vitest";
import { remuxToMp4 } from "../mp4";
import { createRemuxService } from "../remux";
import { AAC_AUDIO_STREAM, VP9_VIDEO_STREAM } from "./fixtures";
import { selfContainingStream } from "./mp4-kit";

const VIDEO_URL = "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/vp9-1080p.mp4?efg=1";
const AUDIO_URL = "https://scontent-lax3-1.cdninstagram.com/o1/v/t16/aac.mp4?efg=1";

type Call = [url: string, init: RequestInit | undefined];

/** Fetch stub that serves canned responses by URL and records how it was called. */
function fetchStub(map: Record<string, Response | Error>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push([url, init]);
    const entry = map[url];
    if (!entry) throw new Error(`unexpected url ${url}`);
    if (entry instanceof Error) throw entry;
    return entry;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function stream(bytes: Uint8Array<ArrayBuffer>, init: ResponseInit = {}): Response {
  return new Response(bytes, {
    ...init,
    headers: { "content-length": String(bytes.byteLength), ...init.headers },
  });
}

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

describe("RemuxService", () => {
  describe("build()", () => {
    it("fetches both streams and returns their remux as a video/mp4 blob", async () => {
      const { impl, calls } = fetchStub({
        [VIDEO_URL]: stream(VP9_VIDEO_STREAM),
        [AUDIO_URL]: stream(AAC_AUDIO_STREAM),
      });
      const service = createRemuxService({ fetchImpl: impl });

      const blob = await service.build({ videoUrl: VIDEO_URL, audioUrl: AUDIO_URL });

      expect(blob.type).toBe("video/mp4");
      expect(await bytesOf(blob)).toEqual(
        Array.from(remuxToMp4([VP9_VIDEO_STREAM, AAC_AUDIO_STREAM])),
      );
      // Video first: it becomes track 1.
      expect(calls.map(([url]) => url)).toEqual([VIDEO_URL, AUDIO_URL]);
    });

    it("omits credentials — the CDN's wildcard CORS answer forbids credentialed reads", async () => {
      const { impl, calls } = fetchStub({
        [VIDEO_URL]: stream(VP9_VIDEO_STREAM),
        [AUDIO_URL]: stream(AAC_AUDIO_STREAM),
      });

      await createRemuxService({ fetchImpl: impl }).build({
        videoUrl: VIDEO_URL,
        audioUrl: AUDIO_URL,
      });

      for (const [, init] of calls) expect(init?.credentials).toBe("omit");
    });

    it("builds a video-only file from a rendition without audio", async () => {
      const { impl, calls } = fetchStub({ [VIDEO_URL]: stream(VP9_VIDEO_STREAM) });

      const blob = await createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL });

      expect(calls).toHaveLength(1);
      expect(await bytesOf(blob)).toEqual(Array.from(remuxToMp4([VP9_VIDEO_STREAM])));
    });

    it("rejects with the status and URL when a stream answers non-2xx", async () => {
      const { impl } = fetchStub({
        [VIDEO_URL]: stream(VP9_VIDEO_STREAM),
        [AUDIO_URL]: new Response("expired", { status: 403 }),
      });

      await expect(
        createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL, audioUrl: AUDIO_URL }),
      ).rejects.toThrow(/RemuxService\.build: fetch \S*aac\.mp4\S* returned 403/);
    });

    it("wraps network errors with the RemuxService.build prefix", async () => {
      const { impl } = fetchStub({
        [VIDEO_URL]: new Error("net broke"),
        [AUDIO_URL]: stream(AAC_AUDIO_STREAM),
      });

      await expect(
        createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL, audioUrl: AUDIO_URL }),
      ).rejects.toThrow(/RemuxService\.build: net broke/);
    });

    it("stops the other transfer when one stream fails", async () => {
      const { impl, calls } = fetchStub({
        [VIDEO_URL]: new Error("net broke"),
        [AUDIO_URL]: stream(AAC_AUDIO_STREAM),
      });

      await expect(
        createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL, audioUrl: AUDIO_URL }),
      ).rejects.toThrow();

      const audioSignal = calls.find(([url]) => url === AUDIO_URL)?.[1]?.signal;
      expect(audioSignal?.aborted).toBe(true);
    });

    it("rejects an oversized rendition from its declared length, before downloading it", async () => {
      const video = stream(VP9_VIDEO_STREAM, { headers: { "content-length": "900" } });
      const audio = stream(AAC_AUDIO_STREAM, { headers: { "content-length": "200" } });
      const { impl } = fetchStub({ [VIDEO_URL]: video, [AUDIO_URL]: audio });

      await expect(
        createRemuxService({ fetchImpl: impl, maxBytes: 1000 }).build({
          videoUrl: VIDEO_URL,
          audioUrl: AUDIO_URL,
        }),
      ).rejects.toThrow(/RemuxService\.build: rendition is .* over the .* limit/);

      expect(video.bodyUsed).toBe(false);
      expect(audio.bodyUsed).toBe(false);
    });

    it("stops a transfer at the limit when no length was declared, instead of buffering it all", async () => {
      // A streamed body carries no content-length header. This one never ends.
      let chunksServed = 0;
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunksServed += 1;
          controller.enqueue(new Uint8Array(400));
        },
      });
      const { impl, calls } = fetchStub({ [VIDEO_URL]: new Response(endless) });

      await expect(
        createRemuxService({ fetchImpl: impl, maxBytes: 1000 }).build({ videoUrl: VIDEO_URL }),
      ).rejects.toThrow(/over the .* limit/);

      // 400 + 400 + 400 crosses 1000: the read stops there and the transfer is aborted.
      expect(chunksServed).toBeLessThanOrEqual(4);
      expect(calls[0][1]?.signal?.aborted).toBe(true);
    });

    it("refuses streams that would remux into a file over the limit, even though they fit under it", async () => {
      // A crafted stream: every transfer check passes, and the remux outgrows the input.
      const crafted = selfContainingStream();
      const { impl } = fetchStub({ [VIDEO_URL]: stream(crafted) });
      expect(remuxToMp4([crafted]).length).toBeGreaterThan(crafted.byteLength);

      await expect(
        createRemuxService({ fetchImpl: impl, maxBytes: crafted.byteLength }).build({
          videoUrl: VIDEO_URL,
        }),
      ).rejects.toThrow(/RemuxService\.build: remuxToMp4: output exceeds the size limit/);
    });

    it("reads a body that arrives in several chunks with no declared length", async () => {
      const half = Math.floor(VP9_VIDEO_STREAM.length / 2);
      const chunked = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(VP9_VIDEO_STREAM.subarray(0, half));
          controller.enqueue(VP9_VIDEO_STREAM.subarray(half));
          controller.close();
        },
      });
      const { impl } = fetchStub({ [VIDEO_URL]: new Response(chunked) });

      const blob = await createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL });

      expect(await bytesOf(blob)).toEqual(Array.from(remuxToMp4([VP9_VIDEO_STREAM])));
    });

    it.each([
      ["another host", "https://example.com/vp9.mp4"],
      ["plain HTTP on the CDN", "http://scontent.cdninstagram.com/vp9.mp4"],
      ["an Instagram page URL", "https://www.instagram.com/api/v1/feed/timeline/"],
    ])("refuses to fetch %s", async (_label, url) => {
      const { impl, calls } = fetchStub({});

      await expect(
        createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL, audioUrl: url }),
      ).rejects.toThrow(/RemuxService\.build: refusing to fetch .*: not a media CDN URL/);

      // Neither stream is requested — not even the valid one.
      expect(calls).toHaveLength(0);
    });

    it("fetches the parsed, absolute form of a URL — the one the host check saw", async () => {
      // Absolute to `new URL`, but a relative path when resolved against an https: page.
      const slashless = "https:scontent-lax3-1.cdninstagram.com/o1/v/t16/vp9-1080p.mp4?efg=1";
      const { impl, calls } = fetchStub({ [VIDEO_URL]: stream(VP9_VIDEO_STREAM) });

      await createRemuxService({ fetchImpl: impl }).build({ videoUrl: slashless });

      expect(calls.map(([url]) => url)).toEqual([VIDEO_URL]);
    });

    it("refuses a stream that redirected off the CDN, without reading it", async () => {
      const redirected = stream(VP9_VIDEO_STREAM);
      Object.defineProperties(redirected, {
        redirected: { value: true },
        url: { value: "https://example.com/elsewhere.mp4" },
      });
      const { impl } = fetchStub({ [VIDEO_URL]: redirected });

      await expect(
        createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL }),
      ).rejects.toThrow(/redirected off the media CDN/);
      expect(redirected.bodyUsed).toBe(false);
    });

    it("accepts a redirect that stays on the CDN", async () => {
      const redirected = stream(VP9_VIDEO_STREAM);
      Object.defineProperties(redirected, {
        redirected: { value: true },
        url: { value: "https://instagram.fphx1-1.fna.fbcdn.net/o1/v/t16/vp9-1080p.mp4" },
      });
      const { impl } = fetchStub({ [VIDEO_URL]: redirected });

      const blob = await createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL });
      expect(blob.type).toBe("video/mp4");
    });

    it("lets a caller widen the allowed hosts", async () => {
      const url = "https://media.example.org/vp9.mp4";
      const { impl } = fetchStub({ [url]: stream(VP9_VIDEO_STREAM) });

      const blob = await createRemuxService({ fetchImpl: impl, isAllowedUrl: () => true }).build({
        videoUrl: url,
      });
      expect(blob.type).toBe("video/mp4");
    });

    it("leaves no timer behind once a build settles", async () => {
      vi.useFakeTimers();
      try {
        const { impl } = fetchStub({ [VIDEO_URL]: stream(VP9_VIDEO_STREAM) });
        await createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL });
        expect(vi.getTimerCount()).toBe(0);

        const failing = fetchStub({ [VIDEO_URL]: new Error("net broke") });
        await expect(
          createRemuxService({ fetchImpl: failing.impl }).build({ videoUrl: VIDEO_URL }),
        ).rejects.toThrow();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("gives up when the transfers outlive the timeout", async () => {
      // Never answers; only settles when the caller's signal aborts.
      const stalled = ((_input: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })) as unknown as typeof fetch;

      await expect(
        createRemuxService({ fetchImpl: stalled, timeoutMs: 20 }).build({ videoUrl: VIDEO_URL }),
      ).rejects.toThrow(/RemuxService\.build: timed out after 0\.02 s/);
    });

    it("rejects streams that aren't fragmented MP4 instead of producing a broken file", async () => {
      const { impl } = fetchStub({
        [VIDEO_URL]: new Response("<html>not a video</html>"),
      });

      await expect(
        createRemuxService({ fetchImpl: impl }).build({ videoUrl: VIDEO_URL }),
      ).rejects.toThrow(/RemuxService\.build: remuxToMp4:/);
    });
  });

  describe("createRemuxService()", () => {
    it("instantiates without throwing (smoke)", () => {
      expect(typeof createRemuxService().build).toBe("function");
    });
  });
});
