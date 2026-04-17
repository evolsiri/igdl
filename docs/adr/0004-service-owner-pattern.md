# 0004 — Service-owner pattern (one ambient API, one owner)

- Status: accepted
- Date: 2026-02-01

## Context

MV3 extensions have several ambient APIs that can be called from anywhere (`chrome.storage`, `chrome.downloads`, `chrome.runtime.sendMessage`, `document.createElement`). Without discipline, these calls scatter across content scripts, background workers, and options pages — making it hard to:

- Test behavior (ambient APIs are global singletons; mocking them in test involves replacing globals).
- Audit permissions (security + Chrome Web Store / Mozilla AMO review both want a narrow surface).
- Enforce contract changes (a new required field on a storage key has to be added everywhere the key is written).

The `createXxxService(options?)` factory pattern — common in the reference extension for the zip flow — gives each ambient API a single owner module with an interface + injectable dependencies.

## Decision

Every ambient API has exactly **one owner module**. Every other module accesses it through the owner service:

| Ambient API                     | Sole owner                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| `chrome.storage.*`              | `src/services/settings/storage.ts` — every other caller (including `MediaCacheService`) imports `chromeStorageLocal` from there |
| `chrome.downloads.*`            | `src/background/shared/downloads.ts`                        |
| `chrome.runtime.sendMessage`    | `src/utils/messages.ts` (sender) + `src/background/shared/router.ts` (receiver) |
| DOM mutation (injected UI)      | `src/content/modals/mount.ts` + content-script handlers     |
| Theme class toggling            | `src/services/theme/theme.ts`                               |

Services follow a consistent shape:

- Factory function `createXxxService(options?): XxxService` — never `new XxxService()`.
- Interface `XxxService` — callers depend on this, not the implementation.
- Options bag for dependency injection (time, storage, fetch, DOM). Defaults are the real implementations; tests pass stubs.

Example:

```ts
export interface SettingsService { /* … */ }

export function createSettingsService(options: SettingsServiceOptions = {}): SettingsService {
  const storage = options.storage ?? chromeStorageLocal();
  // …
}
```

## Consequences

- **Single place to enforce invariants** per API — e.g., `SettingsService` is the only module that knows the storage key layout.
- **Tests are trivially isolated** — every service accepts an in-memory fake via its options bag.
- **Refactors are localized** — changing the storage schema only touches `settings/` + its migration.
- **Lint / review gate is codified** — `code-reviewer` agent + `code-style-guide.md` reject direct `chrome.storage.*` / `chrome.downloads.*` / `chrome.runtime.sendMessage` calls outside the owner modules.
- **Service folders own their tests** under `__tests__/` and their stories (rare) under `__stories__/`.
- **Factories need TSDoc with `@example`** per the contract — so every service is discoverable via `docs/services/<name>.md` + IDE hover.
- **Direct instantiation via `new`** is forbidden and would be caught in review.

See [`adr/0005-co-located-tests-and-stories.md`](./0005-co-located-tests-and-stories.md) for how service test files are organized.
