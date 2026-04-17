import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installXhrInterceptor } from "../xhr";

// Clear the install sentinel between tests so patches reapply.
beforeEach(() => {
  (globalThis as unknown as Record<string, unknown>).__igdl_xhr_installed__ = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as unknown as Record<string, unknown>).__igdl_xhr_installed__ = false;
});

describe("installXhrInterceptor", () => {
  it("is idempotent — second install is a no-op", () => {
    const onSnapshot = vi.fn();
    installXhrInterceptor({ onSnapshot });
    const firstFetch = globalThis.fetch;
    installXhrInterceptor({ onSnapshot });
    expect(globalThis.fetch).toBe(firstFetch);
  });

  it("captures a fetch response body when content-type is JSON", async () => {
    const originalFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [{ id: "X" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", originalFetch);

    const onSnapshot = vi.fn();
    installXhrInterceptor({ onSnapshot });

    await fetch("https://example.com/api/v1/feed/timeline/");

    // The fire-and-forget .then(onSnapshot) needs the event loop to turn
    // over before it fires; yield a full tick.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSnapshot).toHaveBeenCalled();
    const snap = onSnapshot.mock.calls[0]?.[0] as { endpoint: string; body: unknown } | undefined;
    expect(snap?.endpoint).toBe("https://example.com/api/v1/feed/timeline/");
    expect(snap?.body).toEqual({ items: [{ id: "X" }] });
  });

  it("respects a custom shouldCapture predicate (fetch)", async () => {
    const originalFetch = vi.fn(
      async () =>
        new Response("<html/>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    vi.stubGlobal("fetch", originalFetch);

    const onSnapshot = vi.fn();
    installXhrInterceptor({
      onSnapshot,
      shouldCapture: (_, contentType) => contentType.includes("application/json"),
    });

    await fetch("https://example.com/page.html");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("does not break the original fetch when the body can't be parsed", async () => {
    const originalFetch = vi.fn(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", originalFetch);

    const onSnapshot = vi.fn();
    installXhrInterceptor({ onSnapshot });

    const response = await fetch("https://example.com/weird");
    expect(await response.text()).toBe("not json");
  });
});
