# SortableTableHeader

A `<th>` cell that renders a stacked up/down chevron pair to the left of the column label. Each chevron is an independent button — up sets ascending, down sets descending. Clicking the already-active chevron emits `onClear` so the parent can revert to its own default sort.

## Source

`src/options/components/SortableTableHeader.tsx`

## Props

```ts
interface SortableTableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  activeSortKey: K | null;
  activeDirection: "asc" | "desc" | null;
  onSort: (key: K, direction: "asc" | "desc") => void;
  onClear: () => void;
  thClass?: string;
  align?: "left" | "right";
}
```

Generic over `K` so different tables can share the component without leaking each other's column unions.

## Behavior

| State | Up-arrow click | Down-arrow click |
|---|---|---|
| Inactive (`activeSortKey !== sortKey`) | `onSort(sortKey, "asc")` | `onSort(sortKey, "desc")` |
| Active asc | `onClear()` | `onSort(sortKey, "desc")` |
| Active desc | `onSort(sortKey, "asc")` | `onClear()` |

## Accessibility

- Root `<th>` carries `aria-sort="ascending" | "descending" | "none"`.
- Each arrow is a `<button>` with `aria-label="Sort by <label> ascending|descending"` and `aria-pressed` reflecting its active state.
- Focus uses the global `:focus-visible` outline (see `src/index.css`).

## Styling

- Inactive arrow: `text-muted/50 hover:text-fg`.
- Active arrow: `text-accent`.
- Chevron glyphs (`ChevronUpGlyph` / `ChevronDownGlyph`) are 10×10 inline SVG (`viewBox="0 0 12 12"`, `stroke-width="2"`) co-located in this file.
- Zero border-radius everywhere (global reset).
- Hover transition uses `--duration-hover`.

## Tests

`src/options/components/__tests__/SortableTableHeader.spec.tsx` — 10 cases covering label rendering, arrow routing, `onClear` on active-arrow clicks, `aria-sort`, `aria-pressed`, and the active-vs-inactive class.

## Consumers

- `ProfileDirectoriesCard` — five sortable columns (username, directory, download count, last download, added on).
