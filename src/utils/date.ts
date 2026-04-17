import dayjs from "dayjs";

/**
 * Formats a date per a Day.js-style template.
 *
 * Used by `DownloadService` to interpolate the `{datetime}` placeholder in a
 * filename. Defaults to the PAC-5.6 template `YYYYMMDD_HHmmss`.
 *
 * @example
 * formatDate(new Date("2026-04-16T15:07:42Z"), "YYYYMMDD_HHmmss");
 * // → "20260416_150742"
 */
export function formatDate(date: Date | number, template: string): string {
  if (template.length === 0) return "";
  return dayjs(date).format(template);
}
