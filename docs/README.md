# igdl docs

Internals of the igdl browser extension. Code is the source of truth; these docs explain the *why* and the *shape*.

If you're a user looking to install the extension, read the root [`../README.md`](../README.md). If you're a contributor, start with [`../CLAUDE.md`](../CLAUDE.md) for the hard rules, then read these top-down.

## Top-level

- [**architecture.md**](./architecture.md) — module map, message bus, storage contract, MV3 lifecycle, manifest divergence.
- [**build-and-release.md**](./build-and-release.md) — how sources turn into Chrome / Firefox extensions and how releases are cut, locally and in CI.
- [**code-style-guide.md**](./code-style-guide.md) — service folder layout, TSDoc contract, single-owner ambient APIs, naming, imports.
- [**content-script.md**](./content-script.md) — content-script routing, XHR/fetch interception, Shadow DOM mount.
- [**design-system.md**](./design-system.md) — index pointing at the Storybook design-system story (the source of truth).
- [**development.md**](./development.md) — getting set up, common commands, sideload steps.
- [**download-flow.md**](./download-flow.md) — the click-to-file trace from user click to `chrome.downloads.download`.
- [**project-readme.md**](./project-readme.md) — voice & scope rule for the project root `README.md`.

## Services

One doc per service in [`src/services/`](../src/services/). Each describes the public API, lifecycle, storage surface, call sites, and invariants.

- [services/download.md](./services/download.md) — `DownloadService`
- [services/media-cache.md](./services/media-cache.md) — `MediaCacheService`
- [services/settings.md](./services/settings.md) — `SettingsService` (the storage monopoly)
- [services/theme.md](./services/theme.md) — `ThemeService`
- [services/toast.md](./services/toast.md) — `ToastService`
- [services/zip.md](./services/zip.md) — `ZipService`

## Suggested reading order

1. [`../CLAUDE.md`](../CLAUDE.md) — the rules everyone has to follow.
2. [architecture.md](./architecture.md) — the layout.
3. [download-flow.md](./download-flow.md) — the canonical end-to-end trace.
4. [services/settings.md](./services/settings.md) — the highest-traffic service and a model for the rest.

This index has no commentary on individual files — read the file. If a doc looks stale, the code wins.
