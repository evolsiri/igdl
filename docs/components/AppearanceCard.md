# AppearanceCard

First card on the options page. Controls the `settings.theme` value.

## Source

`src/options/components/cards/AppearanceCard.tsx`

## Props

```ts
interface AppearanceCardProps {
  theme: ThemeSetting;               // current value
  onChange: (next: ThemeSetting) => void;
}
```

## Rendering

- `<Card>` with title "Appearance" and a short subtitle.
- A `role="radiogroup"` containing three `<label>`s: **System**, **Light**, **Dark**. Each has its own short description.
- The visible radio indicator is a small square that fills with accent when checked (no rounded corners, per TAC-7.1).

## Wiring

`App.tsx` passes `settings.theme` and a handler that calls `settingsService.patch({ theme })`. `App.tsx` also calls `themeService.apply(settings.theme)` on every change so the DOM class flips immediately.

## Tests

`src/options/components/cards/__tests__/AppearanceCard.spec.tsx` — 2 cases: renders all three radios with correct checked state; `onChange` fires with the clicked value.
