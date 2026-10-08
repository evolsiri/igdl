# ToastService

Renders the success / failure / info toast stack over Instagram or Threads when downloads complete. Lazily creates a Shadow-DOM mount on the first toast, keeps it alive across subsequent toasts, and unmounts it on `dispose()`.

## Public API

```ts
interface ToastService {
  success(message: string): () => void;
  failure(message: string): () => void;
  info(message: string): () => void;
  loading(message: string): () => void;
  dispose(): void;
}

function createToastService(options?: ToastServiceOptions): ToastService;
```

| Method | What it does |
| --- | --- |
| `success` | Brand-green left bar. Auto-dismisses after ~4 s. Returns a manual-dismiss function. |
| `failure` | Brand-pink left bar. Same auto-dismiss. |
| `info` | Neutral. Used for outcomes that are neither a clean success nor an error: the user dismissed the Save-As dialog, a reel was saved in standard quality because its VP9 version failed, a VP9 download is already in progress. |
| `loading` | Persistent toast with an inline spinner. Does **not** auto-dismiss; call the returned function when the operation completes. Used by the carousel-zip flow, by story downloads waiting on data, and by VP9 reel downloads — while the reels feed is asked for a manifest, and while the background prepares the file. |
| `dispose` | Removes the shadow host. Idempotent — safe to call during page unload even if no toast was ever shown. |

The returned dismiss function lets callers cancel a toast early (e.g. when navigating away).

## Lifecycle

Lazy: the shadow mount is created on the first toast call (any kind) and reused for every subsequent toast. Empty stacks `render(null, container)` to drop the Preact tree but leave the host attached so the next toast doesn't pay the mount-creation cost again.

## Storage

None.

## Call sites

- `src/content/downloadBridge.ts` — the cached `DownloadFlowDeps` instance; reused across every download.
- `src/content/flow/download.tsx:downloadAll` — fires `success`, `failure`, or `info` based on the per-resource aggregate (all-canceled vs partial vs success vs failure, plus the VP9 success and VP9 fallback variants).
- `src/content/flow/download.tsx:queueResource` — shows `loading` while the background prepares a VP9 file.
- `src/content/downloadBridge.ts:downloadViaFlow` — `info` for a repeated click on a reel whose VP9 download is in flight, and `failure` / `info` on the right-click Save As path.
- `src/content/downloadBridge.ts:reportVp9Lookup` — `loading` while `src/content/handlers/reels.ts` looks a reel's manifest up before a VP9 download.

## Invariants

- The toast stack lives in a Shadow DOM via `createShadowMount()` — no Tailwind classes, no Instagram CSS leaks. See `../content-script.md`.
- Toast component styling (colours, spacing, animation) lives in `src/content/toasts/Toast.tsx` and reads from `src/content/tokens.ts`. Adding a new toast kind means extending `ToastKind` plus adding a token row.
- Brand colours are load-bearing: success uses `--color-brand-green`; failure uses `--color-brand-pink`. Literals are defined in `src/content/tokens.ts`.
