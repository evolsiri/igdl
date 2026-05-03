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
| `info` | Neutral. Used for non-error user actions (e.g. the user dismissed the Save-As dialog). |
| `loading` | Persistent toast with an inline spinner. Does **not** auto-dismiss; call the returned function when the operation completes. Used by the carousel-zip flow to indicate work in progress. |
| `dispose` | Removes the shadow host. Idempotent — safe to call during page unload even if no toast was ever shown. |

The returned dismiss function lets callers cancel a toast early (e.g. when navigating away).

## Lifecycle

Lazy: the shadow mount is created on the first toast call (any kind) and reused for every subsequent toast. Empty stacks `render(null, container)` to drop the Preact tree but leave the host attached so the next toast doesn't pay the mount-creation cost again.

## Storage

None.

## Call sites

- `src/content/downloadBridge.ts` — the cached `DownloadFlowDeps` instance; reused across every download.
- `src/content/flow/download.tsx:downloadAll` — fires `success`, `failure`, or `info` based on the per-resource aggregate (all-canceled vs partial vs success vs failure).

## Invariants

- The toast stack lives in a Shadow DOM via `createShadowMount()` — no Tailwind classes, no Instagram CSS leaks. See `../content-script.md`.
- Toast component styling (colours, spacing, animation) lives in `src/content/toasts/Toast.tsx` and reads from `src/content/tokens.ts`. Adding a new toast kind means extending `ToastKind` plus adding a token row.
- Brand colours are load-bearing: success uses `--color-brand-green`; failure uses `--color-brand-pink`. Literals are defined in `src/content/tokens.ts`.
