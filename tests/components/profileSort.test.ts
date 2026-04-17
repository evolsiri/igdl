import { describe, expect, it } from "vitest";
import { sortProfiles } from "../../src/options/components/cards/profileSort";
import type { ProfileDirEntry } from "../../src/types/settings";

function entry(overrides: Partial<ProfileDirEntry>): ProfileDirEntry {
  return {
    username: "x",
    directory: "",
    downloadCount: 0,
    lastDownloadAt: null,
    addedAt: 0,
    lastEditedAt: 0,
    ...overrides,
  };
}

describe("sortProfiles", () => {
  it("sorts username case-insensitively ascending", () => {
    const rows = [
      entry({ username: "Charlie" }),
      entry({ username: "alice" }),
      entry({ username: "Bob" }),
    ];
    const sorted = sortProfiles(rows, { key: "username", direction: "asc" });
    expect(sorted.map((r) => r.username)).toEqual(["alice", "Bob", "Charlie"]);
  });

  it("sorts username descending", () => {
    const rows = [
      entry({ username: "alice" }),
      entry({ username: "bob" }),
      entry({ username: "charlie" }),
    ];
    const sorted = sortProfiles(rows, { key: "username", direction: "desc" });
    expect(sorted.map((r) => r.username)).toEqual(["charlie", "bob", "alice"]);
  });

  it("sorts directory ascending", () => {
    const rows = [
      entry({ username: "a", directory: "z/profile" }),
      entry({ username: "b", directory: "a/profile" }),
    ];
    const sorted = sortProfiles(rows, { key: "directory", direction: "asc" });
    expect(sorted.map((r) => r.username)).toEqual(["b", "a"]);
  });

  it("sorts downloadCount numerically, not lexicographically", () => {
    const rows = [
      entry({ username: "a", downloadCount: 9 }),
      entry({ username: "b", downloadCount: 10 }),
      entry({ username: "c", downloadCount: 2 }),
    ];
    const sortedAsc = sortProfiles(rows, { key: "downloadCount", direction: "asc" });
    expect(sortedAsc.map((r) => r.downloadCount)).toEqual([2, 9, 10]);
    const sortedDesc = sortProfiles(rows, { key: "downloadCount", direction: "desc" });
    expect(sortedDesc.map((r) => r.downloadCount)).toEqual([10, 9, 2]);
  });

  it("sorts addedAt desc (default sort)", () => {
    const rows = [
      entry({ username: "old", addedAt: 100 }),
      entry({ username: "newest", addedAt: 300 }),
      entry({ username: "mid", addedAt: 200 }),
    ];
    const sorted = sortProfiles(rows, { key: "addedAt", direction: "desc" });
    expect(sorted.map((r) => r.username)).toEqual(["newest", "mid", "old"]);
  });

  it("pins null lastDownloadAt to bottom under descending", () => {
    const rows = [
      entry({ username: "a", lastDownloadAt: null, addedAt: 1 }),
      entry({ username: "b", lastDownloadAt: 10, addedAt: 2 }),
      entry({ username: "c", lastDownloadAt: null, addedAt: 3 }),
      entry({ username: "d", lastDownloadAt: 20, addedAt: 4 }),
    ];
    const sorted = sortProfiles(rows, { key: "lastDownloadAt", direction: "desc" });
    expect(sorted.map((r) => r.username)).toEqual(["d", "b", "c", "a"]);
  });

  it("pins null lastDownloadAt to bottom under ascending", () => {
    const rows = [
      entry({ username: "a", lastDownloadAt: null, addedAt: 1 }),
      entry({ username: "b", lastDownloadAt: 10, addedAt: 2 }),
      entry({ username: "c", lastDownloadAt: null, addedAt: 3 }),
      entry({ username: "d", lastDownloadAt: 20, addedAt: 4 }),
    ];
    const sorted = sortProfiles(rows, { key: "lastDownloadAt", direction: "asc" });
    expect(sorted.map((r) => r.username)).toEqual(["b", "d", "c", "a"]);
  });

  it("applies the addedAt-desc tie-breaker for equal primary keys", () => {
    const rows = [
      entry({ username: "a", downloadCount: 5, addedAt: 1 }),
      entry({ username: "b", downloadCount: 5, addedAt: 3 }),
      entry({ username: "c", downloadCount: 5, addedAt: 2 }),
    ];
    const sorted = sortProfiles(rows, { key: "downloadCount", direction: "asc" });
    expect(sorted.map((r) => r.username)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      entry({ username: "a", addedAt: 1 }),
      entry({ username: "b", addedAt: 2 }),
    ];
    const original = [...rows];
    sortProfiles(rows, { key: "addedAt", direction: "desc" });
    expect(rows).toEqual(original);
  });
});
