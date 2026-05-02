# DownloadsCard

Second card on the options page. Hosts all 13 Downloads settings per PAC-5 with a per-card searchable list (PAC-4.3).

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
| 2 | `prefix` | TextField | `"instagram"` |
| 3 | `alwaysPromptSaveAs` | Toggle | `false` |
| 4 | `filenameTemplate` | TextField | `"{username}-{id}-{datetime}"` |
| 5 | `datetimeFormat` | TextField | `"YYYYMMDD_HHmmss"` |
| 6 | `enableDatetimeFormat` | Toggle | `true` |
| 7 | `replaceJpegWithJpg` | Toggle | `true` |
| 8 | `useCarouselIndexing` | Toggle | `true` |
| 9 | `showOpenInNewTabIcon` | Toggle | `true` |
| 10 | `showZipDownloadIcon` | Toggle | `true` |
| 11 | `enableThreadsSupport` | Toggle | `true` |
| 12 | `enableVideoControls` | Toggle | `true` |
| 13 | `enableExploreVideoClickthrough` | Toggle | `false` |

Each item has a per-row reset that calls `onPatch({ [field]: SETTINGS_DEFAULTS[field] })` (PAC-4.5).

## Search semantics

- Input at the top of the card.
- Every item carries a `tokens` string (label + synonyms + keywords).
- Filter uses `matchesQuery` from `src/utils/search.ts` — case-insensitive, multi-token AND.
- **Zero-match renders all** (PAC-4.3) — no "no results" empty state. Prevents users from being stuck when they mistype.

## Tests

`src/options/components/cards/__tests__/DownloadsCard.spec.tsx` — 5 cases:
- Renders every labeled setting.
- Search filters to matching items.
- Zero-match renders all (PAC-4.3 behavior verified).
- TextField edit fires `onPatch({ [field]: value })`.
- Toggle click fires `onPatch({ [field]: !checked })`.

## Design notes

Settings live as an ordered array of `{ key, tokens, render }` objects declared inside the component. This avoids per-setting prop drilling while keeping search + reset uniform. If we outgrow this, break the array into module-level data.
