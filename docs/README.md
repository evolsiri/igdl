# igdl docs

This folder documents the internals of the `igdl` browser extension. Every service under `src/services/*` has a dedicated doc, and every card / modal / toast Preact component does too. Architecture-wide concerns live in `architecture.md`; cross-cutting concerns and process docs have their own files; significant decisions are recorded as ADRs under `adr/`.

The tables below are the canonical index. If a file listed here does not exist yet, the corresponding source code has not shipped.

## Architecture

| Doc | Covers |
|---|---|
| [`architecture.md`](./architecture.md) | Module boundaries, message flow, storage flow, XHR-interception layer, Threads bridge |
| [`code-style-guide.md`](./code-style-guide.md) | File layout, service factory pattern, messaging, UI, TypeScript, architectural invariants |
| [`design-system.md`](./design-system.md) | Design-system index. Pointer to the `Design System/*` Storybook stories (palette, tokens, component inventory) which are the source of truth. |

## Process

| Doc | Covers |
|---|---|
| [`release.md`](./release.md) | Release checklist for Chrome Web Store + Mozilla AMO |
| [`ci.md`](./ci.md) | GitHub Actions workflows, gate order, local parity commands, storybook test gating |
| [`build-and-packaging.md`](./build-and-packaging.md) | Multi-entry build pipeline, Chrome/Firefox packaging, dist layout |

## Core flows

| Doc | Covers |
|---|---|
| [`content-script-routing.md`](./content-script-routing.md) | 3 s poll loop, surface → handler routing table, click dispatch |
| [`download-flow.md`](./download-flow.md) | Post-Action Coordinator pipeline: profile directory resolution, never-ask, NoDirPopup, queue, toast |
| [`shadow-dom-mount.md`](./shadow-dom-mount.md) | `createShadowMount()` primitive — style isolation + keyboard guard for all injected UI |
| [`xhr-interception.md`](./xhr-interception.md) | Page-world `XMLHttpRequest` + `fetch` patching, `inject.js` bootstrap, Firefox loader |

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
| [`components/ResetAllCard.md`](./components/ResetAllCard.md) | `src/options/components/cards/ResetAllCard.tsx` |
| [`components/AddProfileModal.md`](./components/AddProfileModal.md) | `src/options/components/modals/AddProfileModal.tsx` |
| [`components/ConfirmDialog.md`](./components/ConfirmDialog.md) | `src/options/components/ConfirmDialog.tsx` |
| [`components/SortableTableHeader.md`](./components/SortableTableHeader.md) | `src/options/components/SortableTableHeader.tsx` |

## Components — injected on Instagram / Threads

| Doc | Source |
|---|---|
| [`components/NoDirPopup.md`](./components/NoDirPopup.md) | `src/content/modals/NoDirPopup.tsx` |
| [`components/Toast.md`](./components/Toast.md) | `src/content/toasts/Toast.tsx` |

## Decisions

See [`adr/README.md`](./adr/README.md) for the decision log and template. The six initial records cover zero border-radius, Shadow DOM isolation, page-world XHR patching, the service-owner pattern, co-located tests, and the two-manifest lockstep.
