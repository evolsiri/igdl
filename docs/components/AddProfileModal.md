# AddProfileModal

Dialog opened from `ProfileDirectoriesCard`'s "+ Add profile" button. Collects `{ username, directory }` and calls the provided `onSubmit`.

## Source

`src/options/components/modals/AddProfileModal.tsx`

## Props

```ts
interface AddProfileModalProps {
  open: boolean;
  initialDirectory: string;              // typically `${defaultDownloadDirectory}/`
  onSubmit: (input: { username: string; directory: string }) => Promise<void> | void;
  onCancel: () => void;
}
```

## Behavior

- Uses native `<dialog>` via `showModal()` when `open` becomes true; `close()` on open=false. Falls back to `open` attribute toggling under jsdom (tests rely on this).
- On open, resets `username` to empty + `directory` to `initialDirectory` + clears any error, then auto-focuses the username input on the next animation frame.
- Submit trims the username; empty shows an inline error ("Username is required.") and does not call `onSubmit`.
- If `onSubmit` throws (typical cause: duplicate username from `SettingsService.addProfile`), the thrown message surfaces as a `role="alert"` paragraph inside the dialog.
- Esc closes the dialog via the native `close` event; parent receives `onCancel`.

## Tests

`src/options/components/modals/__tests__/AddProfileModal.spec.tsx` — 5 cases:
- Directory input pre-populated with `initialDirectory`.
- Empty username shows validation error.
- Submit sends trimmed username + directory.
- `onSubmit` rejection surfaces inside the dialog.
- Cancel button fires `onCancel`.

## Design notes

- Username submitted unmodified (only trimmed). `SettingsService.addProfile` lowercases + normalizes on its way into storage — the modal doesn't second-guess it so the user sees their raw input if they need to correct a mistake.
- The native `<dialog>` plus inline style mix works for options-page context. Injected UI (e.g. NoDirPopup) uses Shadow DOM with its own inline-styled backdrop — no `<dialog>`.
