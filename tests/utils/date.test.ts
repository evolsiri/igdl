import { describe, expect, it } from "vitest";
import { formatDate } from "../../src/utils/date";

describe("formatDate", () => {
  // A fixed timestamp — 2026-04-16 15:07:42.000 local time.
  // Tests assert against local-zone formatting because that's what users see.
  const fixture = new Date(2026, 3, 16, 15, 7, 42, 0);

  it("formats the default PLAN.md datetime template (YYYYMMDD_HHmmss)", () => {
    expect(formatDate(fixture, "YYYYMMDD_HHmmss")).toBe("20260416_150742");
  });

  it("handles ISO-ish format with separators", () => {
    expect(formatDate(fixture, "YYYY-MM-DD HH:mm:ss")).toBe("2026-04-16 15:07:42");
  });

  it("pads single-digit month/day/hour/minute/second", () => {
    const early = new Date(2026, 0, 5, 4, 3, 2, 0);
    expect(formatDate(early, "YYYYMMDD_HHmmss")).toBe("20260105_040302");
  });

  it("supports unpadded tokens (M, D, H, m, s)", () => {
    const early = new Date(2026, 0, 5, 4, 3, 2, 0);
    expect(formatDate(early, "YYYY-M-D_H:m:s")).toBe("2026-1-5_4:3:2");
  });

  it("accepts a numeric timestamp (epoch ms)", () => {
    expect(formatDate(fixture.getTime(), "YYYYMMDD_HHmmss")).toBe("20260416_150742");
  });

  it("returns an empty string when template is empty", () => {
    expect(formatDate(fixture, "")).toBe("");
  });

  it("preserves literal characters that aren't tokens", () => {
    expect(formatDate(fixture, "[ig]_YYYY")).toBe("ig_2026");
  });
});
