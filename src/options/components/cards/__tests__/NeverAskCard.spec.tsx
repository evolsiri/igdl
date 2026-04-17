import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeverAskCard } from "../NeverAskCard";
import type { NeverAskEntry } from "../../../../types/settings";

afterEach(cleanup);

function entry(username: string, addedAt = 1_700_000_000_000): NeverAskEntry {
  return { username, addedAt };
}

describe("NeverAskCard", () => {
  it("renders the empty state when no entries exist", () => {
    render(<NeverAskCard entries={[]} onRemove={() => {}} />);
    expect(screen.getByText(/no profiles opted out yet/i)).toBeTruthy();
  });

  it("renders entries with username and added-at timestamp", () => {
    render(<NeverAskCard entries={[entry("alice"), entry("bob")]} onRemove={() => {}} />);
    expect(screen.getByTestId("never-ask-row-alice")).toBeTruthy();
    expect(screen.getByTestId("never-ask-row-bob")).toBeTruthy();
  });

  it("filters entries by search query", () => {
    render(<NeverAskCard entries={[entry("alice"), entry("bob")]} onRemove={() => {}} />);
    const search = screen.getByRole("searchbox", { name: /search never-ask profiles/i });
    fireEvent.input(search, { target: { value: "bob" } });
    expect(screen.queryByTestId("never-ask-row-alice")).toBeNull();
    expect(screen.getByTestId("never-ask-row-bob")).toBeTruthy();
  });

  it("renders all entries when search query matches nothing (PAC-4.6 behavior)", () => {
    render(<NeverAskCard entries={[entry("alice"), entry("bob")]} onRemove={() => {}} />);
    const search = screen.getByRole("searchbox", { name: /search never-ask profiles/i });
    fireEvent.input(search, { target: { value: "zzz" } });
    expect(screen.getByTestId("never-ask-row-alice")).toBeTruthy();
    expect(screen.getByTestId("never-ask-row-bob")).toBeTruthy();
  });

  it("calls onRemove after confirm", async () => {
    const onRemove = vi.fn(async () => undefined);
    render(<NeverAskCard entries={[entry("alice")]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove alice/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("alice"));
  });

  it("does not call onRemove if cancel is clicked", () => {
    const onRemove = vi.fn();
    render(<NeverAskCard entries={[entry("alice")]} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove alice/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRemove).not.toHaveBeenCalled();
  });
});
