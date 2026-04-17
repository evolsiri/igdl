# ResetAllCard

Sixth and final card on the options page. Wipes every setting + the never-ask list + the `MediaCacheService` ephemeral caches. Destructive; protected by a confirm dialog.

## Source

`src/options/components/cards/ResetAllCard.tsx`

## Props

```ts
interface ResetAllCardProps {
  onReset: () => Promise<void> | void;
}
```

`App.tsx` wires `onReset` to run `settingsService.resetAll()` followed by `mediaCacheService.clearAll()`.

## Rendering

- `<Card>` with the destructive explanatory subtitle.
- One button styled in the destructive palette (outlined red; fills on hover). No default-action emphasis — reset is a deliberate choice.
- Clicking the button opens a `ConfirmDialog` with `destructive` styling; the confirm button label reads "Reset everything".

## Behavior

- Confirm → sets `busy`, calls `onReset()`, awaits, then closes the dialog regardless of outcome.
- Cancel → closes the dialog, no side effects.

## Tests

`src/options/components/cards/__tests__/ResetAllCard.spec.tsx` — 3 cases:
- Button click opens the confirm dialog.
- Confirm fires `onReset`.
- Cancel does not fire `onReset`.

## Design notes

`busy` state disables both the primary button and the confirm button while the async reset runs. Belt + suspenders — prevents double-reset from impatient clicks, and the label becomes "Resetting…" for feedback.
