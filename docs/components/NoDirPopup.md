# NoDirPopup

Content-script popup shown when the user clicks the download button on a profile that has no configured directory and isn't on the never-ask list (PAC-2.4).

## Source

`src/content/modals/NoDirPopup.tsx`

## Props

```ts
interface NoDirPopupProps {
  username: string;
  initialDirectory: string;   // typically `${prefix}/` from settings
  defaultDirectory: string;
  onChoice: (action: NoDirAction) => void;
  onCancel: () => void;
}

type NoDirAction =
  | { kind: "setDirectory"; directory: string }
  | { kind: "default" }
  | { kind: "neverAsk" };
```

## Layout

Mounted inside a Shadow DOM via `createShadowMount()`. Uses inline styles from `src/content/tokens.ts` — no Tailwind inside the shadow root. Backdrop with `rgba(0, 0, 0, 0.5)` + a centered panel (~380-460px wide).

## Flow

1. Body: a single informational line — "No custom directory is configured for this profile."
2. Initial view: three buttons.
   - **Set directory for @username** — primary (accent green). Flips the popup into edit mode.
   - **Download to `<defaultDirectory>`** — ghost. Carries an info glyph flex-pinned to the far right inside the button; hovering the glyph surfaces a tooltip to its right explaining that the target is configured under *Settings → Downloads → Default download directory*.
   - **Never ask for @username** — ghost. Same pattern: hovering the inner info glyph surfaces a tooltip pointing to *Settings → Never-Ask Profiles* for removal.
3. Edit mode: an input pre-populated with `initialDirectory` (auto-focused, selected). Enter or "Save & download" submits. "Back" returns to the choice view. Empty input is rejected (returns to the three-button view no-op).

## Keyboard

- Escape or Backspace cancels from any view.
- Enter submits the edit-mode input.

## Additional cancel affordances

- **× button** — absolute-positioned in the top-right corner of the panel; fires `onCancel` on click.
- **Backdrop click** — clicking the darkened overlay outside the panel fires `onCancel` (guarded: only when `e.target === e.currentTarget`).

## Consumers

`src/content/flow/download.tsx` — `handleDownloadClick` creates a shadow mount and renders `<NoDirPopup>` when neither the custom-directory nor the never-ask path matches.

## Tests

`tests/content/modals/NoDirPopup.test.tsx` — covers render, each choice button, the edit-mode flow, empty submit, Escape cancel, tooltip hover on both info glyphs, and the removed prompt copy.

## Design notes

Keeps the three-button view + the edit-mode view inside one component so callers deal with one `onChoice` callback. If the component grows, split the edit view into its own sub-component — but don't split the callback surface; the one-callback model keeps `flow/download.tsx` simple.
