import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "../messages";

describe("sendMessage", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "test-ext",
        sendMessage: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards a well-formed response unchanged", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { downloadId: 42 },
    });
    const result = await sendMessage({
      type: "OPEN_URL",
      url: "https://example.com",
    });
    expect(result).toEqual({ ok: true, data: { downloadId: 42 } });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "OPEN_URL",
      url: "https://example.com",
    });
  });

  it("returns { ok: false, error } on transport failure", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("no receiver"),
    );
    const result = await sendMessage({ type: "OPEN_URL", url: "https://x" });
    expect(result).toEqual({ ok: false, error: "no receiver" });
  });

  it("returns { ok: false } when the response is malformed", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue("garbage");
    const result = await sendMessage({ type: "OPEN_URL", url: "https://x" });
    expect(result.ok).toBe(false);
  });

  it("coerces non-Error rejections to string", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue("oops");
    const result = await sendMessage({ type: "OPEN_URL", url: "https://x" });
    expect(result).toEqual({ ok: false, error: "oops" });
  });
});
