# ThemeService

Resolves a user theme preference (`system` / `light` / `dark`) to a concrete theme and toggles a `dark` class on the root element. When the preference is `system`, it subscribes to `matchMedia("(prefers-color-scheme: dark)")` so OS changes take effect live without re-rendering Preact.

This service does **not** persist. Persistence is `SettingsService`'s job — the options page reads `settings.theme` and feeds it to `apply()`, then re-applies on every settings change.

## Public API

```ts
type ThemeSetting = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeService {
  resolve(preference: ThemeSetting): ResolvedTheme;
  apply(preference: ThemeSetting): void;
  subscribe(listener: (theme: ResolvedTheme) => void): () => void;
  dispose(): void;
}

function createThemeService(options?: ThemeServiceOptions): ThemeService;
```

| Method | What it does |
| --- | --- |
| `resolve` | Pure: maps `system` to the OS preference, else echoes the input. |
| `apply` | Toggles the `dark` class on the root element, fires subscribers, and (re)attaches the OS-change listener iff the preference is `system`. |
| `subscribe` | Listener fires on every `apply()` and (when preference is `system`) on every OS theme change. Returns an unsubscribe function. |
| `dispose` | Detaches the OS listener and clears subscribers. Idempotent. |

`ThemeServiceOptions` lets tests inject `root` and `matchMedia` substitutes; defaults are `document.documentElement` and `window.matchMedia`.

## Lifecycle

Stateful: holds the current preference, the subscriber set, and the OS listener handle. The OS listener is attached/detached lazily — only present while the preference is `system`. `dispose()` is symmetric to construction.

## Storage

None. The preference flows in from `SettingsService`.

## Call sites

- `src/options/main.tsx` (or equivalent options-page bootstrap) — creates a `ThemeService`, subscribes to `SettingsService`, and re-`apply()`s on every settings change.

## Invariants

- The service touches one DOM concern: the `dark` class on the root element. It does not write inline styles, doesn't write data attributes, and doesn't render anything.
- It must never call into `chrome.storage.*` or persist anything.
- The OS-change listener is attached only while preference is `system`. Switching to `light` or `dark` detaches it — no orphan listeners.
