# igdl docs

This folder documents the internals of the `igdl` browser extension. Every service under `src/services/*` has a dedicated doc, and every card / modal / toast Preact component does too. Architecture-wide concerns live in `architecture.md`.

The tables below are the canonical index. If a file listed here does not exist yet, the corresponding source code has not shipped.

## Architecture

| Doc | Covers |
|---|---|
| [`architecture.md`](./architecture.md) | Module boundaries, message flow, storage flow, XHR-interception layer, Threads bridge |
| [`design-system.md`](./design-system.md) | Design-system index. Pointer to the `Design System/*` Storybook stories (palette, tokens, component inventory) which are the source of truth. |
| [`release.md`](./release.md) | Release checklist for Chrome Web Store + Mozilla AMO |

## Services

| Doc | Source |
|---|---|
| [`services/settings.md`](./services/settings.md) | `src/services/settings/` |
| [`services/media-cache.md`](./services/media-cache.md) | `src/services/media-cache/` |
| [`services/download.md`](./services/download.md) | `src/services/download/` |
| [`services/theme.md`](./services/theme.md) | `src/services/theme/` |
| [`services/toast.md`](./services/toast.md) | `src/services/toast/` |
| [`services/zip.md`](./services/zip.md) | `src/services/zip/` |

## Components — options page

| Doc | Source |
|---|---|
| [`components/AppearanceCard.md`](./components/AppearanceCard.md) | `src/options/components/cards/AppearanceCard.tsx` |
| [`components/DownloadsCard.md`](./components/DownloadsCard.md) | `src/options/components/cards/DownloadsCard.tsx` |
| [`components/ProfileDirectoriesCard.md`](./components/ProfileDirectoriesCard.md) | `src/options/components/cards/ProfileDirectoriesCard.tsx` |
| [`components/NeverAskCard.md`](./components/NeverAskCard.md) | `src/options/components/cards/NeverAskCard.tsx` |
| [`components/HowItWorksCard.md`](./components/HowItWorksCard.md) | `src/options/components/cards/HowItWorksCard.tsx` |
| [`components/ResetAllCard.md`](./components/ResetAllCard.md) | `src/options/components/cards/ResetAllCard.tsx` |
| [`components/AddProfileModal.md`](./components/AddProfileModal.md) | `src/options/components/modals/AddProfileModal.tsx` |

## Components — injected on Instagram / Threads

| Doc | Source |
|---|---|
| [`components/NoDirPopup.md`](./components/NoDirPopup.md) | `src/content/modals/NoDirPopup.tsx` |
| [`components/Toast.md`](./components/Toast.md) | `src/content/toasts/Toast.tsx` |
