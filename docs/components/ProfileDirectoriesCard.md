# ProfileDirectoriesCard

Third card on the options page. Manages the per-profile download directories — the feature that differentiates `igdl` from the reference extension. Per PAC-6 + the 6-column table from Round 1 decision 2.

## Source

`src/options/components/cards/ProfileDirectoriesCard.tsx`

## Props

```ts
interface ProfileDirectoriesCardProps {
  profiles: ProfileDirEntry[];
  baseDirectory: string;
  sort: ProfileDirectoriesSort;
  onAdd: (input: AddProfileInput) => Promise<ProfileDirEntry>;
  onUpdate: (username: string, fields: UpdateProfileInput) => Promise<ProfileDirEntry>;
  onDelete: (username: string) => Promise<void>;
  onSortChange: (sort: ProfileDirectoriesSort) => void;
}
```

## Table schema

| Column | Source |
|---|---|
| Username | `row.username` |
| Directory | `row.directory` |
| # Downloads | `row.downloadCount` |
| Last download | `row.lastDownloadAt` (formatted) |
| Added on | `row.addedAt` (formatted) |
| Last edited | `row.lastEditedAt` (formatted) |

A seventh column holds the per-row delete button.

## Interactions

- **Click a cell** → enters edit mode for `username` or `directory` columns; other cells are read-only (PAC-6.3). Input auto-focuses + selects its content.
- **Enter** → saves via `onUpdate(username, { field: draft })`.
- **Blur** → saves.
- **Escape** → discards the draft, exits edit mode.
- **Collision or empty username** → error banner surfaces the service's thrown error for ~5s, then clears.
- **Delete button** → `ConfirmDialog` with destructive styling → `onDelete(username)`.
- **Add button** (in the card header) → opens `AddProfileModal` pre-populated with `<baseDirectory>/`.
- **Sort arrows** (stacked up/down, to the left of each sortable column label) →
  up = asc, down = desc. Clicking the already-active arrow reverts to the default
  sort (`addedAt` desc, i.e. "most recently added on top"). Search filters apply
  first and sort runs on the filtered rows, so the two compose cleanly.

## Empty + filtered states

- No profiles: shows the "no profiles yet" copy with a prompt to click Add.
- Profiles exist + query matches none: shows "No profiles match `<query>`." (different from DownloadsCard's "render all" because the directory-table uselessly showing all rows when the user typed a filter would be worse UX).

## Tests

`tests/components/ProfileDirectoriesCard.test.tsx` — 11 cases:
- Empty state.
- Add button opens the modal.
- Rows render with username / directory / download count.
- Clicking a cell shows the input.
- Enter saves.
- Blur saves.
- Escape reverts without calling `onUpdate`.
- Delete icon → dialog → `onDelete` fires only after confirm.
- `onUpdate` rejection surfaces as the error alert.
- Search filters rows.

## Design notes

- The per-row edit state lives at the card level (`editing: { username, field, draft } | null`), and each row is a stateless `ProfileRow` component that receives `editing | null`. Only the editing row mounts the input; the rest render buttons that look like cells.
- Timestamps use `_format.ts`'s `formatShortDate` helper (dayjs `YYYY-MM-DD HH:mm`) so the column widths stay predictable.
- Sort state lives in `Settings` (not in the card) so it persists across reloads. The card is stateless w.r.t. sort — it reads the current sort from props and calls `onSortChange` for updates. The pure comparator is `sortProfiles` in `./profileSort.ts`.
