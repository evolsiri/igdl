import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileDirectoriesCard } from "../ProfileDirectoriesCard";
import {
  PROFILE_DIRECTORIES_DEFAULT_SORT,
  type ProfileDirEntry,
  type ProfileDirectoriesSort,
} from "../../../../types/settings";

afterEach(cleanup);

function makeEntry(overrides: Partial<ProfileDirEntry> = {}): ProfileDirEntry {
  return {
    username: "alice",
    directory: "ig/alice",
    downloadCount: 3,
    lastDownloadAt: 1_700_000_000_000,
    addedAt: 1_699_000_000_000,
    lastEditedAt: 1_699_500_000_000,
    ...overrides,
  };
}

function defaultProps(sort: ProfileDirectoriesSort = { ...PROFILE_DIRECTORIES_DEFAULT_SORT }) {
  return {
    profiles: [] as ProfileDirEntry[],
    defaultDirectory: "instagram",
    prefix: "instagram",
    neverAskProfiles: [] as { username: string; addedAt: number }[],
    sort,
    onAdd: vi.fn(async () => makeEntry()),
    onUpdate: vi.fn(async () => makeEntry()),
    onDelete: vi.fn(async () => undefined),
    onSortChange: vi.fn(),
    onRemoveNeverAsk: vi.fn(async () => undefined),
  };
}

function rowUsernames(): string[] {
  const table = screen.getByTestId("profile-directories-table");
  const buttons = within(table).getAllByTestId(/^row-.+-username-cell$/);
  return buttons.map((cell) => cell.textContent?.trim() ?? "");
}

describe("ProfileDirectoriesCard", () => {
  it("renders the empty state when there are no profiles", () => {
    render(<ProfileDirectoriesCard {...defaultProps()} />);
    expect(screen.getByText(/no profile directories yet/i)).toBeTruthy();
  });

  it("opens the Add Profile modal when + Add profile is clicked", () => {
    render(<ProfileDirectoriesCard {...defaultProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByRole("heading", { name: /add profile directory/i })).toBeTruthy();
  });

  it("renders profile rows with username, directory, and download count", () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" }), makeEntry({ username: "bob" })];
    render(<ProfileDirectoriesCard {...props} />);
    expect(screen.getByTestId("profile-directories-table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "alice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "bob" })).toBeTruthy();
  });

  it("switches a cell into edit mode when clicked", () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" })];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "alice" }));
    expect(screen.getByTestId("row-alice-username-input")).toBeTruthy();
  });

  it("saves an edit on Enter", async () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" })];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "alice" }));
    const input = screen.getByTestId("row-alice-username-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "alice2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(props.onUpdate).toHaveBeenCalledWith("alice", { username: "alice2" });
    });
  });

  it("saves an edit on blur", async () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice", directory: "ig/alice" })];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByText("ig/alice"));
    const input = screen.getByTestId("row-alice-directory-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "ig/alice-renamed" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(props.onUpdate).toHaveBeenCalledWith("alice", { directory: "ig/alice-renamed" });
    });
  });

  it("reverts without saving on Escape", () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" })];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "alice" }));
    const input = screen.getByTestId("row-alice-username-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "alice-modified" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onUpdate).not.toHaveBeenCalled();
    // After escape the input is gone and the original value button is shown.
    expect(screen.getByRole("button", { name: "alice" })).toBeTruthy();
  });

  it("opens the delete confirm dialog when trash icon is clicked", () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" })];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete alice/i }));
    expect(screen.getByRole("heading", { name: /delete alice/i })).toBeTruthy();
  });

  it("calls onDelete after confirm", async () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" })];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /delete alice/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(props.onDelete).toHaveBeenCalledWith("alice");
    });
  });

  it("displays an error alert when onUpdate rejects", async () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" })];
    props.onUpdate = vi.fn(async () => {
      throw new Error("username already exists");
    });
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "alice" }));
    const input = screen.getByTestId("row-alice-username-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "bob" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("username already exists");
    });
  });

  it("shows a conflict dialog when adding a profile already on the Never-Ask list", async () => {
    const props = defaultProps();
    props.neverAskProfiles = [{ username: "alice", addedAt: 1 }];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.input(screen.getByLabelText("Instagram username"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /add @alice to profile directories/i })).toBeTruthy();
    });
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("calls onAdd and onRemoveNeverAsk when the conflict dialog is confirmed", async () => {
    const props = defaultProps();
    props.neverAskProfiles = [{ username: "alice", addedAt: 1 }];
    render(<ProfileDirectoriesCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.input(screen.getByLabelText("Instagram username"), { target: { value: "ALICE" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => screen.getByRole("heading", { name: /add @alice to profile directories/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    await waitFor(() => {
      expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ username: "alice" }));
      expect(props.onRemoveNeverAsk).toHaveBeenCalledWith("alice");
    });
  });

  it("filters rows by search query", () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" }), makeEntry({ username: "bob" })];
    render(<ProfileDirectoriesCard {...props} />);
    const search = screen.getByRole("searchbox", { name: /search profile directories/i });
    fireEvent.input(search, { target: { value: "bob" } });
    expect(screen.queryByRole("button", { name: "alice" })).toBeNull();
    expect(screen.getByRole("button", { name: "bob" })).toBeTruthy();
  });

  describe("sorting", () => {
    const profiles = [
      makeEntry({ username: "charlie", downloadCount: 5, addedAt: 3, lastDownloadAt: 30 }),
      makeEntry({ username: "alice", downloadCount: 42, addedAt: 1, lastDownloadAt: 10 }),
      makeEntry({ username: "bob", downloadCount: 7, addedAt: 2, lastDownloadAt: null }),
    ];

    it("renders rows in the default `addedAt` desc order when sort is default", () => {
      const props = defaultProps();
      props.profiles = profiles;
      render(<ProfileDirectoriesCard {...props} />);
      expect(rowUsernames()).toEqual(["charlie", "bob", "alice"]);
    });

    it("emits onSortChange when the up-arrow of an inactive column is clicked", () => {
      const props = defaultProps();
      props.profiles = profiles;
      render(<ProfileDirectoriesCard {...props} />);
      const usernameHeader = screen.getByTestId("sortable-th-username");
      fireEvent.click(within(usernameHeader).getByTestId("sort-arrow-up"));
      expect(props.onSortChange).toHaveBeenCalledWith({ key: "username", direction: "asc" });
    });

    it("emits onSortChange with desc when the down-arrow of the directory column is clicked", () => {
      const props = defaultProps();
      props.profiles = profiles;
      render(<ProfileDirectoriesCard {...props} />);
      const header = screen.getByTestId("sortable-th-directory");
      fireEvent.click(within(header).getByTestId("sort-arrow-down"));
      expect(props.onSortChange).toHaveBeenCalledWith({ key: "directory", direction: "desc" });
    });

    it("reverts to the default sort when the already-active arrow is clicked", () => {
      const props = defaultProps({ key: "username", direction: "asc" });
      props.profiles = profiles;
      render(<ProfileDirectoriesCard {...props} />);
      const header = screen.getByTestId("sortable-th-username");
      fireEvent.click(within(header).getByTestId("sort-arrow-up"));
      expect(props.onSortChange).toHaveBeenCalledWith({ key: "addedAt", direction: "desc" });
    });

    it("renders rows in the active sort order", () => {
      const props = defaultProps({ key: "username", direction: "asc" });
      props.profiles = profiles;
      render(<ProfileDirectoriesCard {...props} />);
      expect(rowUsernames()).toEqual(["alice", "bob", "charlie"]);
    });

    it("applies the sort on top of the search filter", () => {
      const props = defaultProps({ key: "downloadCount", direction: "desc" });
      props.profiles = [
        makeEntry({ username: "alice", directory: "ig/alice", downloadCount: 42, addedAt: 1 }),
        makeEntry({ username: "bob", directory: "ig/bob", downloadCount: 7, addedAt: 2 }),
        makeEntry({ username: "charlie", directory: "ig/charlie", downloadCount: 5, addedAt: 3 }),
        makeEntry({ username: "alice2", directory: "ig/alice2", downloadCount: 100, addedAt: 4 }),
      ];
      render(<ProfileDirectoriesCard {...props} />);
      const search = screen.getByRole("searchbox", { name: /search profile directories/i });
      fireEvent.input(search, { target: { value: "alice" } });
      expect(rowUsernames()).toEqual(["alice2", "alice"]);
    });

    it("pins rows with null lastDownloadAt to the bottom regardless of direction", () => {
      const withNull = [
        makeEntry({ username: "alice", lastDownloadAt: 100, addedAt: 1 }),
        makeEntry({ username: "bob", lastDownloadAt: null, addedAt: 2 }),
        makeEntry({ username: "charlie", lastDownloadAt: 50, addedAt: 3 }),
      ];
      const props = defaultProps({ key: "lastDownloadAt", direction: "desc" });
      props.profiles = withNull;
      const { rerender } = render(<ProfileDirectoriesCard {...props} />);
      expect(rowUsernames()).toEqual(["alice", "charlie", "bob"]);

      rerender(
        <ProfileDirectoriesCard
          {...props}
          sort={{ key: "lastDownloadAt", direction: "asc" }}
        />,
      );
      expect(rowUsernames()).toEqual(["charlie", "alice", "bob"]);
    });

    it("sets aria-sort on the active column", () => {
      const props = defaultProps({ key: "addedAt", direction: "desc" });
      props.profiles = profiles;
      render(<ProfileDirectoriesCard {...props} />);
      expect(screen.getByTestId("sortable-th-addedAt").getAttribute("aria-sort")).toBe(
        "descending",
      );
      expect(screen.getByTestId("sortable-th-username").getAttribute("aria-sort")).toBe("none");
    });
  });
});
