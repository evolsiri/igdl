import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeverAskCard } from "../NeverAskCard";
import type { NeverAskEntry } from "../../../../types/settings";

afterEach(cleanup);

function entry(username: string, addedAt = 1_700_000_000_000): NeverAskEntry {
  return { username, addedAt };
}

function defaultProps(overrides: Partial<Parameters<typeof NeverAskCard>[0]> = {}) {
  return {
    entries: [] as NeverAskEntry[],
    profileDirectoryUsernames: [] as string[],
    onAdd: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    onRemoveFromDirectories: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("NeverAskCard", () => {
  it("renders the empty state when no entries exist", () => {
    render(<NeverAskCard {...defaultProps()} />);
    expect(screen.getByText(/no profiles opted out yet/i)).toBeTruthy();
  });

  it("renders entries with username and added-at timestamp", () => {
    render(<NeverAskCard {...defaultProps({ entries: [entry("alice"), entry("bob")] })} />);
    expect(screen.getByTestId("never-ask-row-alice")).toBeTruthy();
    expect(screen.getByTestId("never-ask-row-bob")).toBeTruthy();
  });

  it("filters entries by search query", () => {
    render(<NeverAskCard {...defaultProps({ entries: [entry("alice"), entry("bob")] })} />);
    const search = screen.getByRole("searchbox", { name: /search never-ask profiles/i });
    fireEvent.input(search, { target: { value: "bob" } });
    expect(screen.queryByTestId("never-ask-row-alice")).toBeNull();
    expect(screen.getByTestId("never-ask-row-bob")).toBeTruthy();
  });

  it("renders all entries when search query matches nothing (PAC-4.6 behavior)", () => {
    render(<NeverAskCard {...defaultProps({ entries: [entry("alice"), entry("bob")] })} />);
    const search = screen.getByRole("searchbox", { name: /search never-ask profiles/i });
    fireEvent.input(search, { target: { value: "zzz" } });
    expect(screen.getByTestId("never-ask-row-alice")).toBeTruthy();
    expect(screen.getByTestId("never-ask-row-bob")).toBeTruthy();
  });

  it("calls onRemove after confirm", async () => {
    const props = defaultProps({ entries: [entry("alice")] });
    render(<NeverAskCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove alice/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith("alice"));
  });

  it("does not call onRemove if cancel is clicked", () => {
    const props = defaultProps({ entries: [entry("alice")] });
    render(<NeverAskCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /remove alice/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("opens the Add modal when + Add profile is clicked", () => {
    render(<NeverAskCard {...defaultProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByRole("heading", { name: /add to never-ask/i })).toBeTruthy();
  });

  it("calls onAdd when a new username is submitted via the modal", async () => {
    const props = defaultProps();
    render(<NeverAskCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.input(screen.getByLabelText(/instagram username/i), { target: { value: "newuser" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(props.onAdd).toHaveBeenCalledWith("newuser"));
  });

  it("shows a conflict dialog when adding a profile already in Profile Directories", async () => {
    const props = defaultProps({ profileDirectoryUsernames: ["alice"] });
    render(<NeverAskCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.input(screen.getByLabelText(/instagram username/i), { target: { value: "ALICE" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /add @alice to never-ask/i })).toBeTruthy();
    });
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("calls onAdd and onRemoveFromDirectories when the conflict dialog is confirmed", async () => {
    const props = defaultProps({ profileDirectoryUsernames: ["alice"] });
    render(<NeverAskCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.input(screen.getByLabelText(/instagram username/i), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => screen.getByRole("heading", { name: /add @alice to never-ask/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Never-Ask" }));
    await waitFor(() => {
      expect(props.onAdd).toHaveBeenCalledWith("alice");
      expect(props.onRemoveFromDirectories).toHaveBeenCalledWith("alice");
    });
  });

  it("shows an inline error when adding a duplicate entry via the modal", async () => {
    const props = defaultProps({ entries: [entry("alice")] });
    render(<NeverAskCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.input(screen.getByLabelText(/instagram username/i), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("already on the Never-Ask list");
    });
  });
});
