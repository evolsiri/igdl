# 0002 — Shadow DOM isolation for all injected UI

- Status: accepted
- Date: 2026-02-01

## Context

Content scripts inject UI (download buttons, NoDirPopup modal, ToastService toast stack) directly into Instagram's DOM. Instagram ships heavy, high-specificity CSS that targets generic element names (`button`, `input`, `a`), so anything we inject into the light DOM inherits Instagram styles — buttons get Instagram's font-size, inputs get Instagram's border, z-index wars against Instagram's overlays are unwinnable.

Tailwind's generated utility classes compound the problem in the other direction: if we load the options-page stylesheet into the content script, thousands of class selectors would leak onto Instagram's own DOM, potentially breaking their layout.

Alternatives considered:

1. **Inline styles everywhere**, no Shadow DOM. Avoids leakage out, but Instagram's global rules (e.g., `input { ... }`) still win without `!important` everywhere.
2. **CSS-in-JS with scoped class names.** Same problem — Instagram's element-name rules still apply.
3. **Heavy `!important` on every injected style.** Works but is a maintenance nightmare; every new rule needs `!important`.

## Decision

Every injected UI element mounts through `createShadowMount()` (`src/content/modals/mount.ts`), which:

- Creates a host element at the document root with `z-index: 2147483647` and `pointer-events: none` (children opt-in).
- Attaches an **open** shadow root. Styles don't cross the boundary in either direction.
- Installs a keyboard guard that stops Instagram's global keyboard shortcuts while focus is in our inputs.

Injected UI uses **inline styles sourced from `src/content/tokens.ts`** (TypeScript constants), not Tailwind. The palette is dark-only — we don't ship two palettes into the content script.

No module other than `createShadowMount` is allowed to `document.createElement(...).attachShadow(...)`. Callers today: `NoDirPopup` (via `src/content/flow/download.tsx`), `ToastService`.

## Consequences

- **Perfect style isolation.** Instagram's CSS never touches our elements; our styles never touch Instagram's.
- **Tailwind is available for the options page only.** Content-script UI lives on inline styles + `TOKENS`/`MOTION` constants.
- **Dark-only injected palette** — simpler than runtime theme detection, works fine against both Instagram's light and dark modes.
- **Keyboard shortcuts are reliable** — the capture-phase guard reliably wins against Instagram's capture-phase handlers because it installs first (during `prewarmModalMount()` in `src/content/index.ts` init).
- **New injected UI has a clear entry point** — every new modal / toast / tooltip goes through `createShadowMount`, so the isolation invariant scales.
- **`ux-reviewer` and `extension-auditor` agents** verify Shadow DOM usage on any diff touching injected UI.
