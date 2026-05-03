# Code Style Guide

Conventions specific to igdl. For the architectural rules everyone has to follow (Shadow DOM isolation, SettingsService monopoly, etc.) see `../CLAUDE.md`.

## TypeScript

Strict mode. `verbatimModuleSyntax: true` is on, so use `import type` for type-only imports — fighting the compiler is a lint error. Avoid `any`. When narrowing untyped data (typically intercepted Instagram payloads) use `unknown` plus an `is`-style guard, never an `as` assertion that could lie at runtime.

No `eslint-disable` without a same-line comment explaining why the rule doesn't apply.

## Preact, not React

JSX files use `/** @jsxImportSource preact */`. Importing from `react` is a lint error. Hooks come from `preact/hooks`.

## Service folder layout

```
src/services/<name>/
  <name>.ts            primary entry — exports the interface + factory
  <secondary>.ts       co-located helpers (e.g. settings/schema.ts, settings/storage.ts)
  __tests__/<name>.spec.ts(x)
```

- The folder name is **lowercase / kebab-case**. The primary file matches the folder name. The matching doc at `docs/services/<name>.md` does too.
- Types inside a service stay PascalCase: the folder is `settings/`, the interface is `SettingsService`.
- **No `index.ts` barrel files anywhere in the repo.** Imports always reach the file they need directly. Barrels obscure the dependency graph and break tree-shaking.
- Every service exports a `createXxxService(options?)` factory and an `XxxService` interface. State lives in the closure; tests inject dependencies through an `XxxServiceOptions` argument (storage adapter, fetch impl, clock, matchMedia, etc.). Defaults wire the production deps:

  ```ts
  export function createXxxService(options: XxxServiceOptions = {}) {
    const now = options.now ?? Date.now;
    const storage = options.storage ?? chromeStorageLocal();
    // …
  }
  ```

- Functions should be single-responsibility and pure where possible.

## TSDoc contract

Every exported function in a service — and every public method on a service interface — has a TSDoc block stating:

1. What the method does.
2. At least one runnable `@example`.

Type-only re-exports and trivial getters are exempt; anything that takes arguments or has side effects is not.

## Filenames

- Components: `PascalCase.tsx` (e.g. `NoDirPopup.tsx`). One component per file.
- Utilities, services, types: `kebab-case.ts`.
- Tests live in `__tests__/<source-name>.spec.ts(x)`. Stories live in `__stories__/<source-name>.stories.tsx`.

## Imports

Prefer relative imports inside a feature folder; cross-feature imports walk back up to `src/` (no aliases). Group order: third-party first, then `../` siblings, then `./` locals. ESLint enforces.

## CSS

- **Options page**: Tailwind v4 utility classes. Theme tokens live in `src/index.css` under `@theme`.
- **Injected UI** (anything rendered into a Shadow DOM by a content script): inline-token styles only, sourced from `src/content/tokens.ts`. Tailwind utilities don't reach inside the shadow root, and no stylesheet is injected there.

## Single-owner ambient APIs

Each ambient API has exactly one owner; every other module goes through the service that owns it.

| API | Sole owner |
| --- | --- |
| `chrome.storage.*` | `src/services/settings/storage.ts` (the `KvStorage` adapter); `MediaCacheService` is the only other consumer of that adapter. |
| `chrome.downloads.*` | `src/background/shared/downloads.ts`. Content scripts send `DOWNLOAD_MEDIA` through `DownloadService`. |
| `chrome.runtime.sendMessage` | `src/utils/messages.ts` (sender) and `src/background/shared/router.ts` (receiver). |
| DOM mutation | Content-script handlers and Preact `render` only. Shadow-DOM boundaries keep injected UI isolated. |

## Messaging

Cross-context messages are variants of the discriminated union in `src/types/messages.ts`. Send them through `sendMessage()` from `src/utils/messages.ts` — never raw `chrome.runtime.sendMessage`. Handlers return `MessageResponse<T> = { ok: true; data } | { ok: false; error }`. Never throw across the boundary; surface failures in the `ok: false` branch. Narrow inbound payloads at the edge with `asMessage()` before dispatching.

To add a new message: add a variant to `Message`, write a handler under `src/background/shared/`, wire it into the `routeMessage` switch in `src/background/shared/router.ts`, and allow-list the type string in `asMessage`.

## UI invariants

- Zero border-radius on every UI element (options page + injected modals + toasts).
- All injected UI mounts inside a Shadow DOM via `createShadowMount()` from `src/content/modals/mount.ts`. No exceptions — content scripts never render into the host DOM directly.
- Animations are CSS transitions only. Trigger on `:hover`, `:focus`, `:focus-visible`, `:active`, or stateful class changes.

## Tests

Vitest + `@testing-library/preact`. Co-located in `__tests__/`. Use the in-memory storage adapter (`inMemoryStorage()` from `src/services/settings/storage.ts`) for any service that touches storage; never mock `chrome.*` ad-hoc.

## Tooling

- Package manager: pnpm. Never npm or yarn.
- Zero lint warnings is a CI gate. `pnpm run lint` must exit clean before a change lands.
