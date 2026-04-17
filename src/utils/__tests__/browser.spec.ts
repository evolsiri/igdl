import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrowserApi, hasBrowserApi } from "../browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser api helpers", () => {
  it("getBrowserApi returns chrome when available", () => {
    vi.stubGlobal("chrome", { runtime: { id: "test-ext" } });
    expect(getBrowserApi()).toBeDefined();
  });

  it("getBrowserApi falls back to browser global when chrome is missing", () => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", { runtime: { id: "test-ext" } });
    expect(getBrowserApi()).toBeDefined();
  });

  it("getBrowserApi throws when neither global has a runtime id", () => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);
    expect(() => getBrowserApi()).toThrow(/extension runtime API unavailable/);
  });

  it("hasBrowserApi returns true when api is available", () => {
    vi.stubGlobal("chrome", { runtime: { id: "test-ext" } });
    expect(hasBrowserApi()).toBe(true);
  });

  it("hasBrowserApi returns false when api is missing", () => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);
    expect(hasBrowserApi()).toBe(false);
  });
});
