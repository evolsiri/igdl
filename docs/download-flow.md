# Download flow (Post-Action Coordinator)

The **Post-Action Coordinator** (PAC) is the content-script pipeline that every download button click funnels through, regardless of which surface (post, reel, story, profile, Threads post) extracted the media. It lives in `src/content/flow/download.tsx` and is the only place that coordinates directory resolution, never-ask state, the modal prompt, the queue call, and the toast.

## Entry point

```ts
handleDownloadClick(
  resources: MediaResource[],
  deps: DownloadFlowDeps,
): Promise<void>
```

- `resources` — one or more resolved media items from the surface handler. Carousels are N items; single media is a 1-item array.
- `deps` — dependency bag: `SettingsService`, `DownloadService`, `ToastService`, plus optional injectables for tests (`mountFactory`, `settingsSnapshot`).

## Flow diagram

```
              click on .download-btn
                      │
          surface handler extracts
          ┌─────────  MediaResource[]  ─────────┐
          │                                     │
          ▼                                     │
     handleDownloadClick(resources, deps)       │
          │                                     │
          ▼                                     │
   ┌─────────────────────────┐                  │
   │ profile has custom dir? │                  │
   │    or on never-ask?     │                  │
   └────┬────────────────┬───┘                  │
   yes  │                │  no                  │
        ▼                ▼                      │
  downloadAll()    show NoDirPopup              │
                        │                       │
                   ┌────┴─────────────┐         │
                   ▼         ▼         ▼         │
            setDirectory  default  neverAsk     │
                   │         │         │         │
                   │         ▼         ▼         │
                   │  downloadAll()  addNeverAsk +
                   ▼                 downloadAll()
          addProfile(dir) +
          downloadAll()
                   │
                   ▼
             SUCCESS toast — ✔  "Downloaded @alice"
             FAILURE toast — ✕  "Download failed: …"
             CANCEL  toast — ℹ  "Download canceled" (when Save As dismissed)
```

## Why it lives in the content script

Two reasons this flow must run in-page rather than in the background worker:

1. **Modals + toasts need a DOM host.** `NoDirPopup` and `ToastService` both mount into a Shadow DOM attached to the Instagram document. The background service worker has no DOM.
2. **`Save As` cancel detection.** Chrome surfaces `"User canceled"` as a message on `chrome.runtime.lastError` when the OS Save dialog is dismissed. The content-script `DownloadService.queue` adapter translates that into an `ok: false` response with a `/cancel/i` pattern in the message, which the content-side `downloadAll` loop counts in the `canceled` bucket to emit the neutral info toast.

## Per-profile routing

Before prompting, the flow checks two pieces of settings state:

| Condition                                                     | Action                                |
| ------------------------------------------------------------- | ------------------------------------- |
| `settings.profileDirectories` has an entry with matching username | Silent download into that directory |
| `settings.neverAskProfiles` has an entry with matching username   | Silent download into default dir    |
| Neither                                                        | Show `NoDirPopup` with 3 choices     |

Username matching is **case-insensitive** (`username.trim().toLowerCase()`), per the canonical normalization in `SettingsService.addProfile`.

## `NoDirPopup` choices

The modal returns one of:

| Kind             | Effect                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| `setDirectory`   | `settings.addProfile({ username, directory })` → download into new directory |
| `default`        | download into `settings.defaultDownloadDirectory` (no settings change)       |
| `neverAsk`       | `settings.addNeverAsk(username)` → download into default, skip prompt next time |
| cancel (Esc / backdrop) | no-op, no download                                                    |

See [`components/NoDirPopup.md`](./components/NoDirPopup.md) for the modal's own API.

## Queue + batch semantics

`downloadAll()` loops over every resource sequentially (not parallel):

```ts
for (const resource of resources) {
  const result = await deps.download.queue(resource);
  // …tally success / cancel / first error
}
```

Carousels sometimes produce 10+ items; serial queueing avoids overwhelming `chrome.downloads` and keeps toast error messages deterministic (first failure wins).

The post-loop toast logic is bucket-based:

| Bucket                                          | Toast                                                      |
| ----------------------------------------------- | ---------------------------------------------------------- |
| At least one success, zero errors               | ✔ green "Downloaded @alice" / "Downloaded N items from @alice" |
| Zero success, ≥1 cancel, zero errors            | ℹ neutral "Download canceled" / "N downloads canceled"     |
| At least one error, zero success                | ✕ red "Download failed: <first error>"                     |
| Partial error (some success + ≥1 error)         | ✕ red "Only N/M downloaded — <first error>"                |

## Tests

`src/content/flow/__tests__/download.spec.tsx` covers:

- Directory-hit path (silent download, no modal).
- Never-ask path (silent download, no modal).
- Cold-start path (popup shown, each of the three choices).
- Popup cancellation (no download).
- Cancel-toast path (every item canceled).
- Partial failure path (first error surfaces, successes still counted).

## Related docs

- [`services/download.md`](./services/download.md) — `DownloadService.queue` contract + naming rules.
- [`services/settings.md`](./services/settings.md) — `addProfile`, `addNeverAsk`.
- [`services/toast.md`](./services/toast.md) — success / failure / info semantics.
- [`components/NoDirPopup.md`](./components/NoDirPopup.md) — the modal.
- [`shadow-dom-mount.md`](./shadow-dom-mount.md) — how the modal mounts safely in Instagram's DOM.
- [`content-script-routing.md`](./content-script-routing.md) — how surface handlers reach this flow.
