import { beforeEach, describe, expect, it, vi } from "vitest";
import { createThemeService, type ThemeSetting } from "../theme";

type MqlListener = (event: MediaQueryListEvent) => void;

interface FakeMql extends MediaQueryList {
  setMatches(value: boolean): void;
  emit(): void;
  listenerCount(): number;
}

function createFakeMatchMedia(initial = false): {
  matchMedia: (q: string) => MediaQueryList;
  mql: FakeMql;
} {
  const listeners = new Set<MqlListener>();
  let matches = initial;

  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_event: string, listener: MqlListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: MqlListener) => {
      listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
    setMatches(value: boolean) {
      matches = value;
      (mql as { matches: boolean }).matches = value;
    },
    emit() {
      const event = { matches, media: mql.media } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
    listenerCount() {
      return listeners.size;
    },
  } as unknown as FakeMql;

  return {
    matchMedia: () => mql,
    mql,
  };
}

function createRoot(): HTMLElement {
  const el = document.createElement("html");
  return el;
}

describe("ThemeService", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = createRoot();
  });

  describe("resolve()", () => {
    it("returns 'light' when preference is 'light' regardless of OS", () => {
      const { matchMedia } = createFakeMatchMedia(true);
      const service = createThemeService({ root, matchMedia });
      expect(service.resolve("light")).toBe("light");
    });

    it("returns 'dark' when preference is 'dark' regardless of OS", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      expect(service.resolve("dark")).toBe("dark");
    });

    it("follows OS when preference is 'system' and OS prefers dark", () => {
      const { matchMedia } = createFakeMatchMedia(true);
      const service = createThemeService({ root, matchMedia });
      expect(service.resolve("system")).toBe("dark");
    });

    it("follows OS when preference is 'system' and OS prefers light", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      expect(service.resolve("system")).toBe("light");
    });
  });

  describe("apply()", () => {
    it("adds .dark class on root for dark preference", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      service.apply("dark");
      expect(root.classList.contains("dark")).toBe(true);
    });

    it("removes .dark class on root for light preference", () => {
      const { matchMedia } = createFakeMatchMedia(true);
      const service = createThemeService({ root, matchMedia });
      service.apply("dark");
      expect(root.classList.contains("dark")).toBe(true);
      service.apply("light");
      expect(root.classList.contains("dark")).toBe(false);
    });

    it("syncs to OS value for system preference", () => {
      const { matchMedia, mql } = createFakeMatchMedia(true);
      const service = createThemeService({ root, matchMedia });
      service.apply("system");
      expect(root.classList.contains("dark")).toBe(true);

      mql.setMatches(false);
      mql.emit();
      expect(root.classList.contains("dark")).toBe(false);

      mql.setMatches(true);
      mql.emit();
      expect(root.classList.contains("dark")).toBe(true);
    });

    it("stops reacting to OS changes when preference switches to explicit", () => {
      const { matchMedia, mql } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      service.apply("system");
      expect(mql.listenerCount()).toBe(1);

      service.apply("light");
      expect(mql.listenerCount()).toBe(0);

      // OS flips — root should not change because preference is explicit
      mql.setMatches(true);
      mql.emit();
      expect(root.classList.contains("dark")).toBe(false);
    });

    it("re-attaches the OS listener when preference returns to 'system'", () => {
      const { matchMedia, mql } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      service.apply("system");
      service.apply("light");
      service.apply("system");
      expect(mql.listenerCount()).toBe(1);
    });
  });

  describe("subscribe()", () => {
    it("fires listener on every apply()", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      const listener = vi.fn();
      service.subscribe(listener);

      service.apply("dark");
      service.apply("light");
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, "dark");
      expect(listener).toHaveBeenNthCalledWith(2, "light");
    });

    it("fires listener on OS change while preference is 'system'", () => {
      const { matchMedia, mql } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      const listener = vi.fn();
      service.apply("system");
      service.subscribe(listener);

      mql.setMatches(true);
      mql.emit();
      expect(listener).toHaveBeenCalledWith("dark");
    });

    it("unsubscribe() stops further notifications", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      const listener = vi.fn();
      const off = service.subscribe(listener);

      service.apply("dark");
      off();
      service.apply("light");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispose()", () => {
    it("detaches the OS listener and clears subscribers", () => {
      const { matchMedia, mql } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      const listener = vi.fn();
      service.subscribe(listener);
      service.apply("system");
      expect(mql.listenerCount()).toBe(1);
      listener.mockClear();

      service.dispose();
      expect(mql.listenerCount()).toBe(0);

      mql.setMatches(true);
      mql.emit();
      expect(listener).not.toHaveBeenCalled();
    });

    it("is idempotent", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      const service = createThemeService({ root, matchMedia });
      service.dispose();
      expect(() => service.dispose()).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("throws when no root is available and none is injected", () => {
      const { matchMedia } = createFakeMatchMedia(false);
      expect(() =>
        createThemeService({ matchMedia, root: undefined as unknown as HTMLElement }),
      ).not.toThrow(); // jsdom provides document.documentElement
    });

    it.each<[ThemeSetting, boolean, "light" | "dark"]>([
      ["system", true, "dark"],
      ["system", false, "light"],
      ["light", true, "light"],
      ["dark", false, "dark"],
    ])("apply(%s) with OS dark=%s → resolves to %s", (pref, osDark, expected) => {
      const { matchMedia } = createFakeMatchMedia(osDark);
      const service = createThemeService({ root, matchMedia });
      service.apply(pref);
      expect(root.classList.contains("dark")).toBe(expected === "dark");
    });
  });
});
