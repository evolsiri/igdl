import { afterEach, describe, expect, it, vi } from "vitest";
import { addCustomBtn, CLASS_CUSTOM_BUTTON, onClickHandler } from "../../src/content/button";

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
});
