import { describe, expect, it } from "vitest";
import { joinPath, sanitizeFilename } from "../path";

describe("joinPath", () => {
  it("joins simple segments with single slashes", () => {
    expect(joinPath("instagram", "alice")).toBe("instagram/alice");
  });

  it("collapses duplicate leading/trailing slashes per segment", () => {
    expect(joinPath("instagram/", "/alice/", "post.jpg")).toBe("instagram/alice/post.jpg");
  });

  it("skips empty or whitespace-only segments", () => {
    expect(joinPath("", "  ", "alice")).toBe("alice");
  });

  it("trims surrounding whitespace", () => {
    expect(joinPath("  instagram ", "  alice  ")).toBe("instagram/alice");
  });

  it("returns an empty string when all segments are empty", () => {
    expect(joinPath("", "", "  ")).toBe("");
  });

  it("does not emit a trailing slash", () => {
    expect(joinPath("instagram", "alice/")).toBe("instagram/alice");
  });

  it("does not emit a leading slash", () => {
    expect(joinPath("/instagram", "alice")).toBe("instagram/alice");
  });

  it("handles a single segment", () => {
    expect(joinPath("alice")).toBe("alice");
  });

  it("ignores non-string arguments safely", () => {
    // @ts-expect-error — exercising defensive branch
    expect(joinPath("a", undefined, "b")).toBe("a/b");
  });
});

describe("sanitizeFilename", () => {
  it("replaces Windows-illegal chars with underscores", () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("collapses runs of underscores from successive illegal chars", () => {
    expect(sanitizeFilename("a///b")).toBe("a_b");
  });

  it("strips leading dots (Windows rejects hidden-style names)", () => {
    expect(sanitizeFilename(".hidden.jpg")).toBe("hidden.jpg");
  });

  it("strips trailing dots", () => {
    expect(sanitizeFilename("file.")).toBe("file");
  });

  it("strips both leading and trailing dots", () => {
    expect(sanitizeFilename(".hidden.")).toBe("hidden");
  });

  it("removes control characters (0x00-0x1F)", () => {
    expect(sanitizeFilename("a\u0000b\u001Fc")).toBe("a_b_c");
  });

  it("preserves spaces inside the name", () => {
    expect(sanitizeFilename("alice post.jpg")).toBe("alice post.jpg");
  });

  it("leaves a clean name unchanged", () => {
    expect(sanitizeFilename("alice-post_1.jpg")).toBe("alice-post_1.jpg");
  });

  it("returns an empty string for all-illegal input", () => {
    expect(sanitizeFilename("///")).toBe("_");
  });
});
