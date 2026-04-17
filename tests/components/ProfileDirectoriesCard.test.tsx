import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileDirectoriesCard } from "../../src/options/components/cards/ProfileDirectoriesCard";
import type { ProfileDirEntry } from "../../src/types/settings";

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

function defaultProps() {
  return {
    profiles: [],
    baseDirectory: "instagram",
    onAdd: vi.fn(async () => makeEntry()),
    onUpdate: vi.fn(async () => makeEntry()),
    onDelete: vi.fn(async () => undefined),
  };
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

  it("filters rows by search query", () => {
    const props = defaultProps();
    props.profiles = [makeEntry({ username: "alice" }), makeEntry({ username: "bob" })];
    render(<ProfileDirectoriesCard {...props} />);
    const search = screen.getByRole("searchbox", { name: /search profile directories/i });
    fireEvent.input(search, { target: { value: "bob" } });
    expect(screen.queryByRole("button", { name: "alice" })).toBeNull();
    expect(screen.getByRole("button", { name: "bob" })).toBeTruthy();
  });
});
