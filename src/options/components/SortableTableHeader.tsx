/**
 * A `<th>` cell that renders a pair of stacked up/down arrow glyphs to the
 * left of the column label. Each arrow is an independently-clickable button
 * that sets the parent's active sort: up = ascending, down = descending.
 *
 * State is fully driven by props — the header knows nothing about storage
 * or defaults. Clicking the already-active arrow emits `onClear` instead of
 * toggling through a half-state; the parent decides what "default" means.
 */

export type SortDirection = "asc" | "desc";

export interface SortableTableHeaderProps<K extends string> {
  /** Visible column label. Also used as the accessible name for the arrow buttons ("Sort by <label> ascending"). */
  label: string;
  /** The sort key this column represents. Emitted back to the parent verbatim. */
  sortKey: K;
  /** The currently-active sort key across the whole table, or `null` if none. */
  activeSortKey: K | null;
  /** The active direction; `null` when `activeSortKey` is `null`. */
  activeDirection: SortDirection | null;
  /** Invoked when the user picks a new sort column/direction. */
  onSort: (key: K, direction: SortDirection) => void;
  /** Invoked when the user clicks the already-active arrow (i.e. "clear back to the default"). */
  onClear: () => void;
  /** Additional classes applied to the root `<th>` (typically width + text-alignment). */
  thClass?: string;
  /** `"right"` reverses the flex order so the label sits before the arrows — used for the `#` column. */
  align?: "left" | "right";
}

export function SortableTableHeader<K extends string>({
  label,
  sortKey,
  activeSortKey,
  activeDirection,
  onSort,
  onClear,
  thClass,
  align = "left",
}: SortableTableHeaderProps<K>) {
  const isActiveColumn = activeSortKey === sortKey;
  const ascActive = isActiveColumn && activeDirection === "asc";
  const descActive = isActiveColumn && activeDirection === "desc";

  const ariaSort: "ascending" | "descending" | "none" = ascActive
    ? "ascending"
    : descActive
      ? "descending"
      : "none";

  function handleUp(): void {
    if (ascActive) onClear();
    else onSort(sortKey, "asc");
  }
  function handleDown(): void {
    if (descActive) onClear();
    else onSort(sortKey, "desc");
  }

  const rowClass =
    align === "right"
      ? "inline-flex items-center gap-1.5 flex-row-reverse"
      : "inline-flex items-center gap-1.5";

  return (
    <th class={`py-2 px-3 ${thClass ?? ""}`.trim()} aria-sort={ariaSort} data-testid={`sortable-th-${sortKey}`}>
      <span class={rowClass}>
        <ArrowStack
          label={label}
          ascActive={ascActive}
          descActive={descActive}
          onUp={handleUp}
          onDown={handleDown}
        />
        <span>{label}</span>
      </span>
    </th>
  );
}

interface ArrowStackProps {
  label: string;
  ascActive: boolean;
  descActive: boolean;
  onUp: () => void;
  onDown: () => void;
}

function ArrowStack({ label, ascActive, descActive, onUp, onDown }: ArrowStackProps) {
  return (
    <span class="inline-flex flex-col leading-none">
      <button
        type="button"
        onClick={onUp}
        aria-label={`Sort by ${label} ascending`}
        aria-pressed={ascActive}
        class={arrowButtonClass(ascActive)}
        data-testid="sort-arrow-up"
      >
        <ChevronUpGlyph />
      </button>
      <button
        type="button"
        onClick={onDown}
        aria-label={`Sort by ${label} descending`}
        aria-pressed={descActive}
        class={arrowButtonClass(descActive)}
        data-testid="sort-arrow-down"
      >
        <ChevronDownGlyph />
      </button>
    </span>
  );
}

function arrowButtonClass(active: boolean): string {
  const tone = active ? "text-accent" : "text-muted/50 hover:text-fg";
  return `inline-flex items-center justify-center w-3 h-3 p-0 bg-transparent transition-colors duration-[var(--duration-hover)] ease-out ${tone}`;
}

export function ChevronUpGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="2 8 6 4 10 8" />
    </svg>
  );
}

export function ChevronDownGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="2 4 6 8 10 4" />
    </svg>
  );
}
