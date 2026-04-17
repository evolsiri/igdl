# Shadow DOM mount primitive

Every injected UI element — `NoDirPopup`, `ToastService`'s toast stack, any future in-page modal — mounts through `createShadowMount()`. This one function encapsulates the invariants that make injected UI safe against Instagram's DOM: style isolation, keyboard-shortcut isolation, and cleanup.

Source: `src/content/modals/mount.ts`.

## What it does

`createShadowMount()` returns a `ShadowMount`:

```ts
interface ShadowMount {
  host: HTMLElement;
  shadow: ShadowRoot;
  render(tree: ComponentChildren): void;
  dispose(): void;
}
```

Internally it:

1. **Creates a host element** at the document root with fixed positioning, full-viewport inset, max z-index (`2147483647`), and `pointer-events: none` so the overlay doesn't intercept clicks unless the rendered tree opts in.
2. **Attaches an open shadow root** (`mode: "open"`) — open so the Preact dev tools can see into it; style isolation is provided by the shadow boundary, not the openness.
3. **Installs a keyboard guard** that stops Instagram's global shortcuts from receiving keystrokes when focus is in an `<input>` or `<textarea>` inside the shadow tree.
4. **Renders / re-renders** Preact trees into a `pointer-events: auto` container inside the shadow root.
5. **Disposes** — unmounts the tree, removes the keyboard listeners, and removes the host from the DOM.

## Why Shadow DOM at all

Instagram's CSS is heavy and uses high-specificity selectors on element names (`button`, `input`, `a`). Without an isolation boundary, any button or input we inject inherits Instagram styles; our styles also leak out and can override Instagram's. Shadow DOM gives us:

- **Style isolation inward** — Instagram's stylesheets can't reach our elements.
- **Style isolation outward** — our styles can't affect Instagram's elements.
- **Z-index isolation** — within a shadow root, z-index is scoped, so we only need to compete with Instagram's top-level overlays (hence the max-int z-index on the host).

## Why inline styles instead of Tailwind

Tailwind v4's generated CSS lives in the options-page bundle. Injecting that stylesheet into the shadow root would pull in thousands of utility classes we don't use, and Tailwind relies on CSS custom properties defined on `:root` — which don't cross the shadow boundary.

The trade-off: injected UI uses `TOKENS` + `MOTION` from `src/content/tokens.ts` as plain TypeScript constants, written directly into inline styles. This is why the injected palette is **dark-only** — we don't want to ship two palettes and a runtime theme check into every content script load; dark works fine against Instagram's interface in both the user's light and dark modes.

See [`adr/0002-shadow-dom-isolation.md`](./adr/0002-shadow-dom-isolation.md) for the full rationale.

## The keyboard guard

Instagram registers keyboard shortcuts on the window in both capture and bubble phases:

- `n` → new post (capture phase at window)
- Arrow keys → story navigation (capture phase at window)
- `j` / `k` / `l` / `m` → navigation (bubble phase at document)

When the user is typing into an input inside our NoDirPopup, those keystrokes must reach the input (so characters, Enter, Backspace work) but must **not** reach Instagram's handlers (so `n` doesn't pop up a new-post dialog mid-typing).

The guard installs six listeners — three `{keydown, keyup, keypress}` on window capture, three on the host bubble — and `stopPropagation()` on any event that traverses our shadow while focus is on an input/textarea. Capture-phase listeners win the race against Instagram's capture-phase listeners as long as ours are installed first; since `createShadowMount()` runs lazily on the first prewarm call from `src/content/index.ts`, and Instagram attaches its shortcut listeners after its main bundle finishes parsing, this is reliable in practice.

`event.composedPath().includes(host)` ensures one shadow mount's guard only affects its own events — multiple modals can coexist.

## Ownership

Only two callers should create shadow mounts:

- `NoDirPopup`'s invoker (`src/content/flow/download.tsx` via `createShadowMount` directly or via a test `mountFactory`).
- `ToastService` (`src/services/toast/toast.tsx` via an injected `mountFactory` option, defaulting to `createShadowMount`).

Any new in-page UI (a dialog, a tooltip, etc.) must go through `createShadowMount()` — no component should `document.createElement(...).attachShadow(...)` manually. See [`adr/0002-shadow-dom-isolation.md`](./adr/0002-shadow-dom-isolation.md).

## Lifecycle

- **Prewarm** — `src/content/index.ts` → `prewarmModalMount()` calls `createShadowMount()` once during init so the host is already in the DOM before the first toast/modal trigger, avoiding a DOM-mutation stutter on first use.
- **Per-modal** — `handleDownloadClick` creates a fresh mount per NoDirPopup show, disposes on the user's choice/cancel. No pooling; modals are short-lived.
- **Singleton-like** — `ToastService` creates one mount lazily on first toast, reuses it for the life of the page, disposes on `dispose()`.

## Tests

Indirect coverage via `NoDirPopup.spec.tsx` and `Toast.spec.tsx` — both exercise `render` / `dispose` and the keyboard guard. There's no standalone `mount.spec.ts` because the primitive is all DOM, and the DOM surfaces we care about are the behaviors those two modals depend on.

## Related docs

- [`adr/0002-shadow-dom-isolation.md`](./adr/0002-shadow-dom-isolation.md) — the decision record.
- [`components/NoDirPopup.md`](./components/NoDirPopup.md) — the biggest consumer.
- [`services/toast.md`](./services/toast.md) — the other consumer.
- [`download-flow.md`](./download-flow.md) — where mounts get created during a click.
