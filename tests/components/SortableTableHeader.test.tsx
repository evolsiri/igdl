import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SortableTableHeader } from "../../src/options/components/SortableTableHeader";

afterEach(cleanup);

type Key = "username" | "addedAt";

function renderIn(
  props: Partial<Parameters<typeof SortableTableHeader<Key>>[0]> = {},
): ReturnType<typeof vi.fn> {
  const onSort = vi.fn();
  const onClear = vi.fn();
  const merged = {
    label: "Username",
    sortKey: "username" as Key,
    activeSortKey: null as Key | null,
    activeDirection: null as "asc" | "desc" | null,
    onSort,
    onClear,
    ...props,
  };
  render(
    <table>
      <thead>
        <tr>
          <SortableTableHeader<Key> {...merged} />
        </tr>
      </thead>
    </table>,
  );
  return Object.assign(onSort, { onClear });
}

describe("SortableTableHeader", () => {
  it("renders the label", () => {
    renderIn({ label: "Username" });
    expect(screen.getByText("Username")).toBeTruthy();
  });

  it("renders up + down arrow buttons with accessible labels", () => {
    renderIn({ label: "Username" });
    expect(screen.getByRole("button", { name: /sort by username ascending/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /sort by username descending/i })).toBeTruthy();
  });

  it("aria-sort is 'none' when inactive", () => {
    renderIn({ activeSortKey: "addedAt", activeDirection: "desc" });
    expect(screen.getByTestId("sortable-th-username").getAttribute("aria-sort")).toBe("none");
  });

  it("aria-sort reflects active ascending", () => {
    renderIn({ activeSortKey: "username", activeDirection: "asc" });
    expect(screen.getByTestId("sortable-th-username").getAttribute("aria-sort")).toBe("ascending");
  });

  it("aria-sort reflects active descending", () => {
    renderIn({ activeSortKey: "username", activeDirection: "desc" });
    expect(screen.getByTestId("sortable-th-username").getAttribute("aria-sort")).toBe(
      "descending",
    );
  });

  it("up-arrow click on inactive column emits onSort(key, asc)", () => {
    const onSort = renderIn();
    fireEvent.click(screen.getByTestId("sort-arrow-up"));
    expect(onSort).toHaveBeenCalledWith("username", "asc");
  });

  it("down-arrow click on inactive column emits onSort(key, desc)", () => {
    const onSort = renderIn();
    fireEvent.click(screen.getByTestId("sort-arrow-down"));
    expect(onSort).toHaveBeenCalledWith("username", "desc");
  });

  it("clicking the already-active asc arrow emits onClear()", () => {
    const onSort = renderIn({ activeSortKey: "username", activeDirection: "asc" });
    fireEvent.click(screen.getByTestId("sort-arrow-up"));
    expect((onSort as unknown as { onClear: ReturnType<typeof vi.fn> }).onClear).toHaveBeenCalled();
    expect(onSort).not.toHaveBeenCalled();
  });

  it("clicking the already-active desc arrow emits onClear()", () => {
    const onSort = renderIn({ activeSortKey: "username", activeDirection: "desc" });
    fireEvent.click(screen.getByTestId("sort-arrow-down"));
    expect((onSort as unknown as { onClear: ReturnType<typeof vi.fn> }).onClear).toHaveBeenCalled();
    expect(onSort).not.toHaveBeenCalled();
  });

  it("active arrow has text-accent class; inactive does not", () => {
    renderIn({ activeSortKey: "username", activeDirection: "asc" });
    const up = screen.getByTestId("sort-arrow-up");
    const down = screen.getByTestId("sort-arrow-down");
    expect(up.className).toContain("text-accent");
    expect(down.className).not.toContain("text-accent");
  });

  it("aria-pressed reflects active direction on each arrow", () => {
    renderIn({ activeSortKey: "username", activeDirection: "asc" });
    expect(screen.getByTestId("sort-arrow-up").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("sort-arrow-down").getAttribute("aria-pressed")).toBe("false");
  });
});
