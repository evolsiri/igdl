# HowItWorksCard

Fifth card on the options page. A static collection of collapsible explainers so users can understand what the extension does.

## Source

`src/options/components/cards/HowItWorksCard.tsx`

## Props

No props — content is hard-coded.

## Sections

Rendered as native `<details>` / `<summary>` so the browser handles open/close without JS. A chevron rotates 90° via CSS on `:is(open)` state.

1. What the extension does.
2. How the button is placed.
3. How directories resolve.
4. Always prompt Save As.
5. Threads.com support.
6. Per-profile opt-out (points users at the NeverAskCard).

## Tests

Currently no dedicated test file — the component is static and covered implicitly by the options-page build smoke test. Add a render test if the content becomes interactive.

## Design notes

- `list-style: none` + `[&::-webkit-details-marker]:hidden` so we can render our own chevron glyph inline. Avoids the Unicode triangle's inconsistent rendering across OSes.
- The prose mentions the green accent, the `prefix` vs `baseDirectory` distinction, and the Threads bridge — keep copy aligned with the current implementation when editing.
