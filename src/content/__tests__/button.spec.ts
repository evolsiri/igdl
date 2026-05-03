import { afterEach, describe, expect, it, vi } from "vitest";
import { addCustomBtn, CLASS_CUSTOM_BUTTON, onClickHandler } from "../button";

vi.mock("../handlers/zip", () => ({
  zipOnClicked: vi.fn(async () => undefined),
}));
vi.mock("../handlers/post", () => ({
  postOnClicked: vi.fn(async () => undefined),
}));
// Remaining handlers are imported transitively by button.ts; mock to prevent
// chrome API access during tests.
vi.mock("../handlers/post-detail", () => ({ postDetailOnClicked: vi.fn() }));
vi.mock("../handlers/profile", () => ({ profileOnClicked: vi.fn() }));
vi.mock("../handlers/profile-reel", () => ({ handleProfileReel: vi.fn() }));
vi.mock("../handlers/reels", () => ({ reelsOnClicked: vi.fn() }));
vi.mock("../handlers/stories", () => ({ storyOnClicked: vi.fn() }));
vi.mock("../handlers/highlights", () => ({ highlightsOnClicked: vi.fn() }));
vi.mock("../threads/button", () => ({ handleThreadsButton: vi.fn() }));

import { zipOnClicked } from "../handlers/zip";
import { postOnClicked } from "../handlers/post";

/**
 * Lightweight tests for the reference-port button factory. The addCustomBtn
 * injection path and the CLASS_CUSTOM_BUTTON sentinel are the meaningful
 * contracts for the polling loop + global click delegator; deeper behavior
 * (click dispatch, hover styling) is covered by manual smoke tests.
 */

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("addCustomBtn", () => {
  it("appends a download button with the shared sentinel class", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    addCustomBtn(host, "black");

    const btn = host.querySelector(`.${CLASS_CUSTOM_BUTTON}.download-btn`);
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute("title")).toBe("Download");
    expect(btn?.innerHTML).toContain("<svg");
  });

  it("supports position:'before' for action-row injection that appends before siblings", () => {
    const host = document.createElement("div");
    const sibling = document.createElement("span");
    sibling.textContent = "existing";
    host.appendChild(sibling);
    document.body.appendChild(host);

    addCustomBtn(host, "white", "before");

    const firstChild = host.firstElementChild;
    expect(firstChild?.classList.contains("download-btn")).toBe(true);
  });

  it("no-ops when node is null", () => {
    expect(() => addCustomBtn(null, "black")).not.toThrow();
  });
});

describe("onClickHandler", () => {
  it("ignores non-anchor elements", () => {
    const div = document.createElement("div");
    expect(() => onClickHandler(div)).not.toThrow();
  });

  it("routes a .zip-btn click to the zip handler, bypassing per-surface routing", () => {
    const anchor = document.createElement("a");
    anchor.className = `${CLASS_CUSTOM_BUTTON} zip-btn`;

    onClickHandler(anchor);

    expect(zipOnClicked).toHaveBeenCalledTimes(1);
    expect(zipOnClicked).toHaveBeenCalledWith(anchor);
    expect(postOnClicked).not.toHaveBeenCalled();
  });

  it("does not route a .download-btn click to the zip handler", () => {
    const anchor = document.createElement("a");
    anchor.className = `${CLASS_CUSTOM_BUTTON} download-btn`;

    onClickHandler(anchor);

    expect(zipOnClicked).not.toHaveBeenCalled();
    // post handler is the default dispatch when no surface-specific URL matches.
    expect(postOnClicked).toHaveBeenCalledTimes(1);
  });
});
