# 0005 — Co-located tests and stories

- Status: accepted
- Date: 2026-04-16
- Supersedes: previous layout that kept tests under a top-level `tests/` folder

## Context

The initial project layout kept all tests in a sibling `tests/` folder mirroring `src/`:

```
src/services/settings/settings.ts
tests/services/settings.test.ts          ← old
```

This mirror drifted over time — folder boundaries in `src/` changed (service renames, subfolder extractions) without matching moves in `tests/`. Imports from tests used `../../src/...` paths that depended on the mirror staying in sync. Rename refactors broke in non-obvious ways.

Most modern TypeScript projects prefer **co-location**:

```
src/services/settings/settings.ts
src/services/settings/__tests__/settings.spec.ts          ← new
```

Benefits: tests find their sibling source via `../settings`, nothing to sync, and navigation is trivial — open the folder, see both.

## Decision

All tests live co-located under `__tests__/` inside the folder of the module they test:

- `src/services/<name>/__tests__/<name>.spec.ts`
- `src/options/components/cards/__tests__/<Name>.spec.tsx`
- `src/content/handlers/__tests__/<name>.spec.ts`
- etc.

Conventions:

- Test file extension: `.spec.ts` / `.spec.tsx` (not `.test.*`).
- One test file per source file is the norm; grouping multiple source files into one spec is allowed when the files are tightly coupled.
- Storybook stories follow the same rule: `<name>.stories.tsx` under a co-located `__stories__/` folder.
- **No barrel files.** Every import points at a concrete file path. Imports stay explicit.

`vitest.config.ts` includes `src/**/__tests__/**/*.spec.{ts,tsx}`.

## Consequences

- **Refactor-safe.** Renaming a service folder moves its tests automatically (they're inside).
- **Clear ownership.** Reading a service folder shows both the implementation and its tests.
- **Shorter import paths.** `import { service } from "../settings"` instead of `../../src/services/settings/settings`.
- **No directory mirror to maintain.** Removing the top-level `tests/` folder deleted ~20 lines of boilerplate imports.
- **Storybook stories coexist in `__stories__/`.** Same reasoning; keeps the "everything about this component in one folder" property.
- **The old layout was migrated in one pass** (commit `2be4274`) and the `tests/` folder was deleted. Any PR re-introducing the old pattern would regress this ADR.
