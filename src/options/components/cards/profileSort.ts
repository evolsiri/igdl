import type { ProfileDirEntry, ProfileDirectoriesSort } from "../../../types/settings";

/**
 * Returns a new array containing `rows` sorted by the given sort spec.
 * Pure: never mutates its input.
 *
 * Rules:
 *  - String columns compare case-insensitively via `localeCompare`.
 *  - Numeric columns (`downloadCount`, `addedAt`) compare as numbers.
 *  - Rows whose `lastDownloadAt` is `null` always sort last regardless of
 *    direction — "never-downloaded" is treated as "no data" and pinned to
 *    the bottom so it doesn't interleave with real timestamps.
 *  - Stable tie-breaker: `addedAt` desc, then `username` asc, so two rows
 *    with equal sort keys always land in the same relative position.
 *
 * @example
 * sortProfiles(rows, { key: "username", direction: "asc" });
 */
export function sortProfiles(
  rows: readonly ProfileDirEntry[],
  sort: ProfileDirectoriesSort,
): ProfileDirEntry[] {
  const { key, direction } = sort;
  const sign = direction === "asc" ? 1 : -1;

  if (key === "lastDownloadAt") {
    const withValue: ProfileDirEntry[] = [];
    const nullValue: ProfileDirEntry[] = [];
    for (const row of rows) {
      if (row.lastDownloadAt === null) nullValue.push(row);
      else withValue.push(row);
    }
    withValue.sort((a, b) => {
      const diff = (a.lastDownloadAt as number) - (b.lastDownloadAt as number);
      return diff !== 0 ? diff * sign : tieBreak(a, b);
    });
    nullValue.sort(tieBreak);
    return [...withValue, ...nullValue];
  }

  const copy = [...rows];
  copy.sort((a, b) => {
    const primary = compare(a, b, key) * sign;
    return primary !== 0 ? primary : tieBreak(a, b);
  });
  return copy;
}

function compare(a: ProfileDirEntry, b: ProfileDirEntry, key: Exclude<ProfileDirectoriesSort["key"], "lastDownloadAt">): number {
  switch (key) {
    case "username":
      return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
    case "directory":
      return a.directory.localeCompare(b.directory, undefined, { sensitivity: "base" });
    case "downloadCount":
      return a.downloadCount - b.downloadCount;
    case "addedAt":
      return a.addedAt - b.addedAt;
  }
}

function tieBreak(a: ProfileDirEntry, b: ProfileDirEntry): number {
  const byAdded = b.addedAt - a.addedAt; // desc
  if (byAdded !== 0) return byAdded;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}
