/**
 * ThemeService owns the extension UI's theme class toggling. It resolves a
 * user preference (`system | light | dark`) to a concrete theme, applies it
 * as a `dark` class on the root element, and — when the preference is
 * `system` — listens for OS theme changes and re-applies automatically.
 *
 * Persistence is NOT handled here (per CLAUDE.md / TAC-4.4). The options page
 * and any other caller reads the user preference from `SettingsService` and
 * feeds it to `apply()`; when settings change, they call `apply()` again.
 */

export type ThemeSetting = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const DARK_CLASS = "dark";
const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

export interface ThemeServiceOptions {
  /** Element to toggle the `dark` class on. Defaults to `document.documentElement`. */
  root?: HTMLElement;
  /** `matchMedia` implementation. Defaults to `window.matchMedia`. Provide a fake for tests. */
  matchMedia?: (query: string) => MediaQueryList;
}

export interface ThemeService {
  /**
   * Resolves a user preference to a concrete theme.
   *
   * @example
   * service.resolve("system"); // → "dark" when the OS prefers dark, else "light"
   * service.resolve("light");  // → "light"
   */
  resolve(preference: ThemeSetting): ResolvedTheme;

  /**
   * Applies a user preference to the DOM: toggles the `dark` class on the root
   * and (re)subscribes to OS-theme-change events when the preference is `system`.
   *
   * @example
   * service.apply("system");
   * // later, when user picks "Dark" in AppearanceCard:
   * service.apply("dark");
   */
  apply(preference: ThemeSetting): void;

  /**
   * Subscribes to the currently-resolved theme. The listener fires whenever
   * `apply()` runs AND (when the preference is `system`) whenever the OS
   * toggles between light and dark. Returns an unsubscribe function.
   *
   * @example
   * const off = service.subscribe((theme) => console.log(theme));
   * off(); // later
   */
  subscribe(listener: (theme: ResolvedTheme) => void): () => void;

  /**
   * Tears down the OS-change listener and drops all subscribers. Idempotent.
   *
   * @example
   * const service = createThemeService();
   * service.apply("system");
   * // later, on page unload:
   * service.dispose();
   */
  dispose(): void;
}

/**
 * Creates a `ThemeService`. Requires a DOM root and `matchMedia`; both are
 * auto-detected in browsers but must be injected in test environments that
 * don't provide them.
 *
 * @example
 * const service = createThemeService();
 * service.apply("system");
 */
export function createThemeService(options: ThemeServiceOptions = {}): ThemeService {
  const rawRoot =
    options.root ??
    (typeof document !== "undefined" ? document.documentElement : null);
  const matchMedia =
    options.matchMedia ??
    (typeof window !== "undefined"
      ? window.matchMedia.bind(window)
      : null);

  if (!rawRoot) {
    throw new Error("ThemeService: no root element available; provide options.root for non-DOM environments.");
  }
  if (!matchMedia) {
    throw new Error("ThemeService: no matchMedia available; provide options.matchMedia for non-DOM environments.");
  }
  const root: HTMLElement = rawRoot;

  const mediaQuery = matchMedia(OS_DARK_QUERY);
  const listeners = new Set<(theme: ResolvedTheme) => void>();
  let currentPreference: ThemeSetting = "system";
  let osListener: ((event: MediaQueryListEvent) => void) | null = null;

  function resolve(preference: ThemeSetting): ResolvedTheme {
    if (preference === "system") {
      return mediaQuery.matches ? "dark" : "light";
    }
    return preference;
  }

  function emit(theme: ResolvedTheme): void {
    if (theme === "dark") {
      root.classList.add(DARK_CLASS);
    } else {
      root.classList.remove(DARK_CLASS);
    }
    for (const listener of listeners) {
      listener(theme);
    }
  }

  function attachOsListener(): void {
    if (osListener) return;
    osListener = () => {
      if (currentPreference === "system") {
        emit(resolve("system"));
      }
    };
    mediaQuery.addEventListener("change", osListener);
  }

  function detachOsListener(): void {
    if (!osListener) return;
    mediaQuery.removeEventListener("change", osListener);
    osListener = null;
  }

  return {
    resolve,
    apply(preference: ThemeSetting): void {
      currentPreference = preference;
      emit(resolve(preference));
      if (preference === "system") {
        attachOsListener();
      } else {
        detachOsListener();
      }
    },
    subscribe(listener: (theme: ResolvedTheme) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose(): void {
      detachOsListener();
      listeners.clear();
    },
  };
}
