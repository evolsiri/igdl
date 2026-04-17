# ToastService

Manages the stack of success / failure / info toasts rendered over Instagram or Threads when downloads complete. Lazily creates one Shadow-DOM mount on first toast, keeps it alive across subsequent toasts, and exposes a tiny `success` / `failure` / `info` / `dispose` API.

## Files

| Path | Role |
|---|---|
| `src/services/toast/toast.tsx` | `createToastService` with factory-injected shadow mount. |
| `src/content/toasts/Toast.tsx` | `Toast` + `ToastStack` components — inline-styled for Shadow DOM. |

## Public API

### `success(message): () => void`

Green toast, auto-dismiss ~4s (PAC-3.1). Returns an early-dismiss function.

```ts
const dismiss = toast.success("Downloaded @alice");
// later
dismiss(); // before the 4s timer fires
```

### `failure(message): () => void`

Red toast with the supplied error message (PAC-3.2). Also auto-dismisses.

### `info(message): () => void`

Neutral toast for non-error user actions — e.g. when the user dismisses the browser's Save As dialog and the download is canceled. Auto-dismisses ~4s.

### `dispose(): void`

Unmounts the stack and removes the shadow host from the document. Idempotent.

## Behavior

- **Stacking** — new toasts append to the bottom; older ones shift slightly upward (PAC-3.3).
- **Auto-dismiss** — default 4s; the entry animates out for ~200ms, then the component calls its `onDismiss` which removes it from the visible set.
- **Shadow-DOM isolation** — the stack renders inside a fixed-position host with `pointer-events: none` on the host and `pointer-events: auto` on the rendered root so only toast areas intercept clicks.
- **Inline styles** — no Tailwind inside the shadow root. Colors come from `src/content/tokens.ts`; timings from `MOTION`.

## Dependency injection

```ts
createToastService({
  mountFactory?: () => ShadowMount,   // default: createShadowMount from content/modals/mount.ts
});
```

Tests pass a fake mount that records `render` calls without actually mounting Preact, making assertions direct and synchronous.

## Consumers

- `src/content/flow/download.tsx` — `downloadAll` fires `toast.success("Downloaded ...")` on success, `toast.failure(error)` on failure, or `toast.info("Download canceled")` when the user dismisses the Save As dialog.
- Potentially future: content-script error paths that can't be handled locally.

## Tests

`src/services/toast/__tests__/toast.spec.ts`:
- Lazy mount creation on first toast.
- Mount reuse across subsequent toasts.
- `dispose()` tears down the mount.
- `dispose()` idempotent.
- Returned dismiss function is callable without throwing.

`tests/content/toasts/Toast.test.tsx`:
- Success vs failure glyph + ARIA role differences.
- Auto-dismiss after `durationMs + transition tail`.

## Design notes

- The Toast component uses `useState(visible)` + `setTimeout` for its own lifecycle. The service owns the stack; each component owns its own disappear animation. This separation keeps stacking math out of the component and keeps animations out of the service.
- Accent tokens are hard-coded to the dark palette inside `tokens.ts` (injected UI always looks dark-theme for consistency on both Instagram and Threads). Respecting the user's options-page theme preference is possible but adds an async storage read on every toast; not worth the cost yet.
