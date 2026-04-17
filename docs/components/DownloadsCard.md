# DownloadsCard

Second card on the options page. Hosts all 14 Downloads settings per PAC-5 with a per-card searchable list (PAC-4.3).

## Source

`src/options/components/cards/DownloadsCard.tsx`

## Props

```ts
interface DownloadsCardProps {
  settings: Settings;
  onPatch: (partial: Partial<Settings>) => Promise<unknown> | void;
}
```

## Settings rendered

| # | Field | Control | Default |
|---|---|---|---|
| 1 | `defaultDownloadDirectory` | TextField | `"instagram"` |
| 2 | `baseDirectory` | TextField | `"instagram"` |
| 3 | `prefix` | TextField | `"instagram"` |
| 4 | `alwaysPromptSaveAs` | Toggle | `false` |
| 5 | `filenameTemplate` | TextField | `"{username}-{id}-{datetime}"` |
| 6 | `datetimeFormat` | TextField | `"YYYYMMDD_HHmmss"` |
| 7 | `enableDatetimeFormat` | Toggle | `true` |
| 8 | `replaceJpegWithJpg` | Toggle | `true` |
| 9 | `useCarouselIndexing` | Toggle | `true` |
| 10 | `showOpenInNewTabIcon` | Toggle | `true` |
| 11 | `showZipDownloadIcon` | Toggle | `true` |
| 12 | `enableThreadsSupport` | Toggle | `true` |
| 13 | `enableVideoControls` | Toggle | `true` |
| 14 | `enableExploreVideoClickthrough` | Toggle | `false` |

Each item has a per-row reset that calls `onPatch({ [field]: SETTINGS_DEFAULTS[field] })` (PAC-4.5).

## Search semantics

- Input at the top of the card.
- Every item carries a `tokens` string (label + synonyms + keywords).
- Filter uses `matchesQuery` from `src/utils/search.ts` — case-insensitive, multi-token AND.
- **Zero-match renders all** (PAC-4.3) — no "no results" empty state. Prevents users from being stuck when they mistype.

## Tests

`tests/components/DownloadsCard.test.tsx` — 5 cases:
- Renders every labeled setting.
- Search filters to matching items.
- Zero-match renders all (PAC-4.3 behavior verified).
- TextField edit fires `onPatch({ [field]: value })`.
- Toggle click fires `onPatch({ [field]: !checked })`.

## Design notes

Settings live as an ordered array of `{ key, tokens, render }` objects declared inside the component. This avoids per-setting prop drilling while keeping search + reset uniform. If we outgrow this, break the array into module-level data.
