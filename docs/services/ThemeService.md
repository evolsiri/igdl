# ThemeService

Resolves a user theme preference (`system` / `light` / `dark`) to a concrete theme, toggles a `.dark` class on the root element, and — when the preference is `system` — subscribes to `matchMedia("(prefers-color-scheme: dark)")` so OS changes take effect live.

Per TAC-4.4, `ThemeService` does not touch storage. The options page reads `settings.theme` from `SettingsService` and calls `themeService.apply(theme)` whenever it changes.

## Files

| Path | Role |
|---|---|
| `src/services/ThemeService/index.ts` | Full implementation + `ThemeServiceOptions` for test injection. |

## Public API

### `resolve(preference): "light" | "dark"`

```ts
service.resolve("system"); // → "dark" if OS prefers dark, else "light"
service.resolve("dark");   // → "dark"
```

### `apply(preference): void`

Toggles the `.dark` class on the configured root (`document.documentElement` by default) and attaches/detaches the OS media-query listener based on the preference.

```ts
service.apply("system");   // follows OS; listens for changes
service.apply("light");    // explicit; OS changes ignored
```

### `subscribe(listener): () => void`

Fires on every `apply()` call AND (when preference is `system`) when the OS toggles between light and dark. Returns an unsubscribe function.

### `dispose(): void`

Detaches the OS listener and clears subscribers. Idempotent.

## Dependency injection

```ts
createThemeService({
  root?: HTMLElement,                                // default: document.documentElement
  matchMedia?: (q: string) => MediaQueryList,        // default: window.matchMedia
});
```

Tests pass a fake `matchMedia` that exposes `.setMatches(value) / .emit()` so the OS-change path is deterministic. See `tests/services/ThemeService.test.ts` for the pattern.

## Consumers

- `src/options/App.tsx` — on mount, calls `apply(settings.theme)`; re-applies whenever `settings.theme` changes.

## Tests

`tests/services/ThemeService.test.ts` — 16 cases:
- `resolve()` for every preference × OS state combination.
- `.dark` class toggling.
- OS listener attach/detach as preference toggles between `system` and explicit values.
- `subscribe` firing on `apply` and on OS change; unsubscribe behavior; cross-check OS changes don't fire on explicit preferences.
- `dispose` idempotency.

## Design notes

- Root-class-only side effect — no storage, no DOM mutation beyond class list. Keeps the service trivially testable and safe to call from any context.
- `system` preference listens via `addEventListener("change")` on the MediaQueryList (modern API). Older `addListener` fallback isn't needed because both target browsers support the new form in MV3-era releases.
