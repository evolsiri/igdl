import { BlobReader, ZipReader } from "@zip.js/zip.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createZipService, type ZipWriterLike } from "../zip";

function makeResponse(body: BlobPart, init?: { status?: number }): Response {
  const status = init?.status ?? 200;
  return new Response(body, { status });
}

function fetchStub(
  map: Record<string, { body: BlobPart; status?: number } | Error>,
): typeof fetch {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push([url, init]);
    const entry = map[url];
    if (!entry) throw new Error(`unexpected url ${url}`);
    if (entry instanceof Error) throw entry;
    return makeResponse(entry.body, { status: entry.status });
  }) as unknown as typeof fetch;
  (impl as unknown as { calls: typeof calls }).calls = calls;
  return impl;
}

describe("ZipService", () => {
  describe("build()", () => {
    it("rejects when entries is empty", async () => {
      const service = createZipService();
      await expect(service.build([])).rejects.toThrow(/no entries/);
    });

    it("fetches each URL with credentials: 'include'", async () => {
      const fetchImpl = fetchStub({
        "https://cdn.example/a.jpg": { body: "a" },
      });
      const service = createZipService({ fetchImpl });
      await service.build([{ url: "https://cdn.example/a.jpg", filename: "a.jpg" }]);
      const calls = (fetchImpl as unknown as {
        calls: Array<[string, RequestInit | undefined]>;
      }).calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe("https://cdn.example/a.jpg");
      expect(calls[0][1]?.credentials).toBe("include");
    });

    it("produces a zip blob whose entries match the requested filenames + contents", async () => {
      const fetchImpl = fetchStub({
        "https://cdn.example/1.jpg": { body: "one-body" },
        "https://cdn.example/2.mp4": { body: "two-body" },
        "https://cdn.example/3.png": { body: "three-body" },
      });
      const service = createZipService({ fetchImpl });
      const blob = await service.build([
        { url: "https://cdn.example/1.jpg", filename: "alice_1.jpg" },
        { url: "https://cdn.example/2.mp4", filename: "alice_2.mp4" },
        { url: "https://cdn.example/3.png", filename: "alice_3.png" },
      ]);
      expect(blob.type).toBe("application/zip");

      const reader = new ZipReader(new BlobReader(blob));
      const entries = await reader.getEntries();
      await reader.close();
      expect(entries.map((e) => e.filename)).toEqual([
        "alice_1.jpg",
        "alice_2.mp4",
        "alice_3.png",
      ]);
      expect(entries[0].uncompressedSize).toBe("one-body".length);
      expect(entries[1].uncompressedSize).toBe("two-body".length);
      expect(entries[2].uncompressedSize).toBe("three-body".length);
    });

    it("rejects with status code in the message when fetch returns non-2xx", async () => {
      const fetchImpl = fetchStub({
        "https://cdn.example/ok.jpg": { body: "ok" },
        "https://cdn.example/bad.jpg": { body: "oops", status: 403 },
      });
      const service = createZipService({ fetchImpl });
      await expect(
        service.build([
          { url: "https://cdn.example/ok.jpg", filename: "a.jpg" },
          { url: "https://cdn.example/bad.jpg", filename: "b.jpg" },
        ]),
      ).rejects.toThrow(/bad\.jpg.*403/);
    });

    it("wraps underlying network errors with ZipService.build prefix", async () => {
      const fetchImpl = fetchStub({
        "https://cdn.example/boom.jpg": new Error("net broke"),
      });
      const service = createZipService({ fetchImpl });
      await expect(
        service.build([{ url: "https://cdn.example/boom.jpg", filename: "a.jpg" }]),
      ).rejects.toThrow(/ZipService\.build:.*net broke/);
    });

    it("closes the writer even when a fetch fails", async () => {
      const add = vi.fn(async () => undefined);
      const close = vi.fn(async () => new Blob([], { type: "application/zip" }));
      const writer: ZipWriterLike = { add, close };
      const fetchImpl = fetchStub({
        "https://cdn.example/ok.jpg": { body: "ok" },
        "https://cdn.example/bad.jpg": { body: "x", status: 500 },
      });
      const service = createZipService({
        fetchImpl,
        writerFactory: () => writer,
      });
      await expect(
        service.build([
          { url: "https://cdn.example/ok.jpg", filename: "a.jpg" },
          { url: "https://cdn.example/bad.jpg", filename: "b.jpg" },
        ]),
      ).rejects.toThrow(/500/);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it("propagates the original failure even if close() also throws", async () => {
      const add = vi.fn(async () => undefined);
      const close = vi.fn(async () => {
        throw new Error("close failed");
      });
      const writer: ZipWriterLike = { add, close };
      const fetchImpl = fetchStub({
        "https://cdn.example/bad.jpg": { body: "x", status: 500 },
      });
      const service = createZipService({
        fetchImpl,
        writerFactory: () => writer,
      });
      await expect(
        service.build([{ url: "https://cdn.example/bad.jpg", filename: "a.jpg" }]),
      ).rejects.toThrow(/500/);
    });
  });

  describe("configure()", () => {
    it("instantiates without throwing (smoke)", () => {
      const service = createZipService();
      expect(typeof service.build).toBe("function");
    });
  });

  beforeEach(() => {
    // Nothing to reset — restoreMocks/clearMocks are global in vitest config.
  });
});
