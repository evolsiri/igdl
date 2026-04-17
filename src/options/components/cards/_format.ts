import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/**
 * Compact absolute timestamp used in tooltips and prose sentences (e.g., the
 * never-ask card's "Added {date}" line).
 *
 * @example
 * formatShortDate(1712345678000); // → "2024-04-05 14:34"
 */
export function formatShortDate(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return "—";
  return dayjs(timestamp).format("YYYY-MM-DD HH:mm");
}

/**
 * Human-friendly relative time ("2 days ago", "just now", "in 3 hours") used
 * in the Profile Directories table so columns stay skinny. Pair with
 * `formatShortDate` in a `title` attribute for the exact timestamp on hover.
 *
 * @example
 * formatRelativeDate(Date.now() - 90_000);          // → "a minute ago"
 * formatRelativeDate(Date.now() - 3 * 86_400_000);  // → "3 days ago"
 * formatRelativeDate(null);                         // → "—"
 */
export function formatRelativeDate(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return "—";
  return dayjs(timestamp).fromNow();
}
