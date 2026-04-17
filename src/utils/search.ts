/**
 * Tokenizes `query` by whitespace and returns true if every token appears as
 * a case-insensitive substring of `haystack`. An empty query matches everything.
 *
 * Used by the Downloads, Profile Directories, and Never-Ask cards' search bars.
 * Per PAC-4.3 / PAC-4.6, an empty-query (or zero-match) case is handled by
 * the caller — this helper just answers "does this item match?".
 *
 * @example
 * matchesQuery("Carousel Download", "caro load"); // → true
 * matchesQuery("Carousel Download", "caro nope"); // → false
 * matchesQuery("anything", ""); // → true
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const lower = haystack.toLowerCase();
  return tokens.every((token) => lower.includes(token));
}

/**
 * Filters items by applying `matchesQuery` to a derived searchable string.
 * Preserves input order. Items whose derived string matches every token in
 * the query are returned.
 *
 * @example
 * const rows = [{ username: "alice", dir: "ig/alice" }, { username: "bob", dir: "ig/bob" }];
 * filterByQuery(rows, "ali", (r) => `${r.username} ${r.dir}`);
 * // → [{ username: "alice", dir: "ig/alice" }]
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  toSearchable: (item: T) => string,
): T[] {
  return items.filter((item) => matchesQuery(toSearchable(item), query));
}
