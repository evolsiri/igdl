# Toast

Per-instance success/failure toast rendered over Instagram or Threads. Use `ToastService` to push toasts; don't mount `<Toast>` directly outside tests.

## Source

`src/content/toasts/Toast.tsx` exports two components:
- `Toast` — one-shot toast with auto-dismiss.
- `ToastStack` — vertical stack of toasts (newer on bottom).

## Toast props

```ts
interface ToastProps {
  kind: "success" | "failure";
  message: string;
  durationMs?: number;   // default 4000 per PAC-3.3
  onDismiss: () => void;
}
```

## Rendering

Inline-styled per `src/content/tokens.ts`:
- Fixed position: bottom-right, offset 24px.
- 240-360px wide, single-line or wrap.
- Left accent bar: `TOKENS.success` for success, `TOKENS.failure` for failure.
- Checkmark glyph (`✓`) for success; × glyph (`✕`) for failure.
- `role="status"` for success (polite), `role="alert"` for failure (assertive).
- Fade + 8px translate-in on mount; fade-out at `durationMs`; unmounts at `durationMs + 200ms`.

## ToastStack props

```ts
interface ToastStackProps {
  toasts: Array<{ id: string; kind: ToastKind; message: string }>;
  onDismiss: (id: string) => void;
}
```

Renders the newest toast at the very bottom and each older one offset up by 4px. Older entries visually stack; PAC-3.3's "stacks gracefully" is satisfied.

## Tests

`src/content/toasts/__tests__/Toast.spec.tsx` — 3 cases:
- Success renders checkmark + `status` role.
- Failure renders × + `alert` role.
- `onDismiss` fires at `durationMs + transition tail`.

Tests use `vi.useFakeTimers()` so time-dependent behavior is deterministic.

## Design notes

- Self-owning lifecycle — each toast component manages its own `setTimeout` for dismiss, so the service doesn't need to track per-toast timers.
- When `ToastService.dispose()` unmounts the stack, individual `setTimeout` handles become orphan fires — harmless because they only call `onDismiss`, which is a no-op on the already-unmounted parent.
