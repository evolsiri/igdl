import { describe, expect, it } from "vitest";
import { filterByQuery, matchesQuery } from "../../src/utils/search";

describe("matchesQuery", () => {
  it("returns true for an empty query", () => {
    expect(matchesQuery("anything", "")).toBe(true);
  });

  it("returns true for a whitespace-only query", () => {
    expect(matchesQuery("anything", "   ")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesQuery("Carousel Download", "carousel")).toBe(true);
    expect(matchesQuery("Carousel Download", "CAROUSEL")).toBe(true);
  });

  it("requires every token to match", () => {
    expect(matchesQuery("Carousel Download", "caro load")).toBe(true);
    expect(matchesQuery("Carousel Download", "caro nope")).toBe(false);
  });

  it("allows tokens in any order", () => {
    expect(matchesQuery("Carousel Download", "load caro")).toBe(true);
  });

  it("matches substrings, not whole words", () => {
    expect(matchesQuery("Carousel", "rou")).toBe(true);
  });

  it("returns false when haystack is empty and query is not", () => {
    expect(matchesQuery("", "x")).toBe(false);
  });

  it("handles multiple spaces between tokens", () => {
    expect(matchesQuery("Carousel Download", "caro    load")).toBe(true);
  });
});

describe("filterByQuery", () => {
  interface Row {
    username: string;
    directory: string;
  }

  const rows: Row[] = [
    { username: "alice", directory: "ig/alice" },
    { username: "bob", directory: "ig/bob" },
    { username: "alicia", directory: "ig/alicia" },
  ];

  it("returns matching rows preserving input order", () => {
    const out = filterByQuery(rows, "ali", (r) => `${r.username} ${r.dir ?? r.directory}`);
    expect(out).toEqual([rows[0], rows[2]]);
  });

  it("returns all rows on empty query", () => {
    expect(filterByQuery(rows, "", (r) => r.username)).toEqual(rows);
  });

  it("returns empty when no rows match", () => {
    expect(filterByQuery(rows, "zzzz", (r) => r.username)).toEqual([]);
  });

  it("applies the provided searchable accessor", () => {
    expect(filterByQuery(rows, "ig/bob", (r) => r.directory)).toEqual([rows[1]]);
  });

  it("works with multiple tokens across the derived string", () => {
    const out = filterByQuery(rows, "alic ig", (r) => `${r.username} ${r.directory}`);
    expect(out).toEqual([rows[0], rows[2]]);
  });
});
