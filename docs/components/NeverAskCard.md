# NeverAskCard

Fourth card on the options page. Shows the list of profiles the user has clicked "Never ask for this profile" on, with the ability to remove an entry and bring the popup back (PAC-7).

## Source

`src/options/components/cards/NeverAskCard.tsx`

## Props

```ts
interface NeverAskCardProps {
  entries: NeverAskEntry[];
  onRemove: (username: string) => Promise<void> | void;
}
```

## Rendering

- Empty state: a one-paragraph explainer pointing at the NoDirPopup "Never ask" button.
- Non-empty state:
  - Search input.
  - List of entries — each shows `@username` and "Added <date>".
  - Delete button per entry → `ConfirmDialog` → `onRemove(username)`.

## Search semantics

Zero-match renders all entries (PAC-4.6) — matches DownloadsCard's behavior.

## Tests

`src/options/components/cards/__tests__/NeverAskCard.spec.tsx` — 6 cases:
- Empty state.
- Entries render with timestamp.
- Search filters entries.
- Zero-match renders all.
- Remove → confirm → `onRemove` fires.
- Cancel keeps the entry.

## Design notes

This card was added in Round 7 after the "Never ask" UX gap was surfaced. Keeping it as its own card (rather than nesting into ProfileDirectoriesCard) matches the user's explicit preference for a "separate list" and keeps each card single-purpose.
