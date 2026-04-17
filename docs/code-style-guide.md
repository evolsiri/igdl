# Code Style Guide

## Layout

- All services should exist in `src/services` and follow this naming scheme:

```
src/services/download/download.ts

# all tests live in co-located __tests__ folder
src/services/download/__tests__/download.spec.ts
```

- Folder names use lowercase or kebab-case (`settings`, `media-cache`). The primary file, the matching doc file under `docs/services/`, and tests under `__tests__/` all share that name.
- Types inside a service keep PascalCase — the folder is `settings`, but `interface SettingsService { … }`.
- Co-locate Storybook stories the same way tests are co-located: `__stories__/<name>.stories.tsx` next to the component.
- No barrel files should exist in the code base.

## Functions and services

- Prefer functions that have a single responsibility and are pure (no side effects) when possible.
- Services are created with a `createXxxService(options?)` factory that returns an interface. Never `new XxxService()`. Callers depend on the interface, not the implementation.
- Inject time, storage, fetch, DOM, and other ambient deps via the options bag with sensible defaults (`{ now = Date.now, storage = chromeStorageLocal(), fetchImpl = globalThis.fetch }`). Tests pass stubs; production wires the defaults.
- Every exported function in a service — not just methods on the service interface — has a TSDoc block with a one-sentence purpose and at least one `@example`.

## Messaging

- Message types are variants of the discriminated union in `src/types/messages.ts`. Send them through the typed wrapper in `src/utils/messages.ts`, not `chrome.runtime.sendMessage` directly.
- Handlers return `MessageResponse<T> = { ok: true; data } | { ok: false; error }`. Never throw across the `chrome.runtime.sendMessage` boundary — surface failures in the `ok: false` branch.
- Narrow unknown inbound payloads at the edge with `asMessage()` before dispatching.

## UI

- Preact only — never React. Import from `preact` and `preact/hooks`. JSX files use `/** @jsxImportSource preact */` when the compiler hint is needed.
- Zero border-radius on every element in all extension UI (options page + injected modals + toasts). Enforced via a global reset.
- All injected UI (modals, toasts, anything content-script-rendered) mounts inside a Shadow DOM via `createShadowMount()`. No exceptions — content scripts never render into the host DOM directly.
- Animations are CSS transitions only — no JS animation libraries. Trigger on `:hover`, `:focus`, `:focus-visible`, `:active`, or stateful class changes.

## TypeScript

- Use `import type` for type-only imports (`verbatimModuleSyntax: true` enforces this — call it out so contributors don't fight the compiler).
- No `eslint-disable` without a same-line reason comment explaining why the rule doesn't apply here.

## Architecture invariants

Each ambient API has exactly one owner; every other module goes through the service that owns it.

- `chrome.storage.*` — only `src/services/settings/storage.ts` (and the shared adapter inside `src/services/media-cache/media-cache.ts`).
- `chrome.downloads.*` — only `src/background/shared/downloads.ts`. Content scripts send `DOWNLOAD_MEDIA` through `DownloadService`.
- `chrome.runtime.sendMessage` — only `src/utils/messages.ts` (sender) and `src/background/shared/router.ts` (receiver).
- DOM mutation — only content-script handlers and Preact render. Shadow-DOM boundaries keep injected UI isolated.

## Tooling

- Package manager: pnpm. Never npm or yarn.
- Zero lint warnings is a CI gate. `pnpm run lint` must exit clean before a change lands.
