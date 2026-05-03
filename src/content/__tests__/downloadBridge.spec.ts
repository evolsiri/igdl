import { describe, expect, it } from "vitest";
import { referenceTypeToCanonical } from "../downloadBridge";

describe("referenceTypeToCanonical", () => {
  it("maps uppercase reference codes", () => {
    expect(referenceTypeToCanonical("POST")).toBe("post");
    expect(referenceTypeToCanonical("REEL")).toBe("reel");
    expect(referenceTypeToCanonical("STOR")).toBe("story");
    expect(referenceTypeToCanonical("HGHT")).toBe("highlight");
    expect(referenceTypeToCanonical("THRD")).toBe("threads");
  });

  it("maps lowercase strings (as used by handlers like storyOnClicked)", () => {
    expect(referenceTypeToCanonical("story")).toBe("story");
    expect(referenceTypeToCanonical("post")).toBe("post");
    expect(referenceTypeToCanonical("reel")).toBe("reel");
    expect(referenceTypeToCanonical("highlight")).toBe("highlight");
    expect(referenceTypeToCanonical("threads")).toBe("threads");
  });

  it("falls back to post for unknown or undefined input", () => {
    expect(referenceTypeToCanonical(undefined)).toBe("post");
    expect(referenceTypeToCanonical("")).toBe("post");
    expect(referenceTypeToCanonical("unknown")).toBe("post");
  });
});
