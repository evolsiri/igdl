# ConfirmDialog

A modal confirmation dialog built on the native `<dialog>` element. Used whenever the options page needs the user to confirm a destructive or irreversible action (e.g., **Reset all settings** from `ResetAllCard`).

## Source

`src/options/components/ConfirmDialog.tsx`

## Props

```ts
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ComponentChildren;
  confirmLabel?: string;   // default "Confirm"
  cancelLabel?: string;    // default "Cancel"
  destructive?: boolean;   // styles confirm button with destructive palette
  onConfirm: () => void;
  onCancel: () => void;
}
```

## Behavior

- Uses the native `<dialog>` element. When `open` flips to `true`, the component calls `dlg.showModal()` on the underlying element — which gives us a correctly-styled browser modal with automatic backdrop, focus trap, and Esc-to-close for free.
- When `open` flips to `false`, the component calls `dlg.close()`. The `onClose` native event is routed to `onCancel` so dismissing via Esc or external `open={false}` both notify the parent.
- In jsdom (tests) the component falls back to setting/removing the `open` attribute if `showModal` / `close` aren't polyfilled.
- Backdrop styling (`backdrop:bg-black/50 backdrop:backdrop-blur-sm`) is applied via the `::backdrop` pseudo-element. Border radius is zero — global reset (TAC-7.1).

## Destructive styling

When `destructive={true}`, the confirm button uses `bg-destructive` / `text-destructive-contrast` (dark red palette). Non-destructive flows get the green accent palette. Both share the hover micro-animation (`hover:scale-[1.02] active:scale-[0.98]`).

## Accessibility

- `aria-labelledby="confirm-dialog-title"` on `<dialog>` — the `<h2>` carries a matching `id`.
- Focus is trapped automatically by `showModal()`.
- Esc-to-cancel is native; we plumb it through `onClose` → `onCancel`.

## Consumers

- `ResetAllCard` — confirms the factory-reset button.
- Any future destructive action in the options page.

## Tests

`src/options/components/__tests__/ConfirmDialog.spec.tsx` — cases covering open/close wiring, destructive palette, confirm/cancel callbacks, Esc-to-cancel, custom labels.
