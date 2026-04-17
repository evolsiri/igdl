# CI

How igdl uses GitHub Actions. There is one workflow today — the release pipeline — and no dedicated PR/push check pipeline. This doc covers what runs, in what order, and which commands you can invoke locally to achieve parity.

## Workflows

| File                              | Trigger                              | Purpose                                    |
| --------------------------------- | ------------------------------------ | ------------------------------------------ |
| `.github/workflows/release.yml`   | `workflow_dispatch` (manual, with `version` input) | Cuts a release: gates, builds, packages, tags, creates GitHub Release. |

No push/PR workflow exists by design — see [`adr/`](./adr/) if we ever add one.

## Release workflow gate order

From `.github/workflows/release.yml`:

1. `actions/checkout@v4` with full history (required for tag pushes).
2. `pnpm/action-setup@v4` (pnpm 9) + `actions/setup-node@v4` (Node 20, pnpm cache).
3. `pnpm install --frozen-lockfile`.
4. **Validate version input** — must match semver `^[0-9]+\.[0-9]+\.[0-9]+$`.
5. **Check tag is available** — errors early if `v<version>` already exists on origin.
6. **Sync versions** — writes the input version into `package.json` + both manifests in `src/manifest/`.
7. **Lint** — `pnpm run lint` (zero warnings required).
8. **Type-check** — `pnpm run typecheck` (`tsc -b`).
9. **Test** — `pnpm run test` (vitest, unit project only — storybook tests are gated separately).
10. **Build Chrome** — `pnpm run build:chrome` (see [`build-and-packaging.md`](./build-and-packaging.md)).
11. **Build Firefox** — `pnpm run build:firefox`.
12. **Lint Firefox build** — `pnpm exec web-ext lint --source-dir=dist/firefox` (catches manifest issues the linter can't).
13. **Package Chrome** + **Package Firefox** — zips into `artifacts/`.
14. **Rename Firefox artifact** — `igdl-<version>.zip` → `igdl-firefox-<version>.zip` for consistency.
15. **Commit version sync + tag** — commits the bumped `package.json` + manifests if they drifted, then pushes `v<version>` tag.
16. **Create GitHub Release** — uploads both zips, auto-generates release notes.

Each step must succeed for the release to complete. Failures leave no tag, no commit, no release.

## Local parity

To reproduce the gate order on your machine:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build:chrome
pnpm run build:firefox
pnpm exec web-ext lint --source-dir=dist/firefox
```

If all seven pass locally, the release pipeline's gates will pass too (barring environment-specific issues like missing CI-only env vars, which we don't have).

## Storybook interaction tests

These are gated separately and are **not** part of the release pipeline today.

- Source: Storybook stories' `play` functions under `src/**/__stories__/*.stories.tsx`.
- Runner: `vitest` with the `@vitest/browser-playwright` provider, chromium instance.
- Entry: `pnpm run test:storybook` — sets `STORYBOOK_TESTS=1` before calling vitest.
- The `STORYBOOK_TESTS=1` env var opts in the second project in `vitest.config.ts`. Without it, `pnpm run test` runs **only** the unit project.

If we add storybook tests to a CI workflow in the future, it needs the Playwright browser:

```yaml
- name: Install Playwright chromium
  run: pnpm exec playwright install --with-deps chromium

- name: Storybook interaction tests
  run: pnpm run test:storybook
```

`--with-deps` installs the Chromium OS libs GHA's `ubuntu-latest` image is missing.

## Why no push/PR CI?

- The release pipeline is the authoritative gate; breakage there blocks the release.
- Local gates (`pnpm run lint`, `pnpm run typecheck`, `pnpm run test`) + pre-commit discipline cover day-to-day regressions.
- Adding a PR workflow would be cheap (~3 minutes per run); we just haven't. If project velocity justifies it, model it after release.yml's gates up through step 12.

## Related docs

- [`release.md`](./release.md) — the release procedure itself (workflow dispatch, what to verify after).
- [`build-and-packaging.md`](./build-and-packaging.md) — what `build:chrome` / `build:firefox` actually do.
