import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoDirPopup } from "../NoDirPopup";

afterEach(cleanup);

function defaults() {
  return {
    username: "alice",
    initialDirectory: "instagram/",
    defaultDirectory: "downloads",
    onChoice: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe("NoDirPopup", () => {
  it("renders the three primary choices by default", () => {
    render(<NoDirPopup {...defaults()} />);
    expect(screen.getByRole("button", { name: /set directory for @alice/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download to/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /never ask for @alice/i })).toBeTruthy();
  });

  it("emits { kind: 'default' } on default-directory button", () => {
    const props = defaults();
    render(<NoDirPopup {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /download to/i }));
    expect(props.onChoice).toHaveBeenCalledWith({ kind: "default" });
  });

  it("emits { kind: 'neverAsk' } on never-ask button", () => {
    const props = defaults();
    render(<NoDirPopup {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /never ask/i }));
    expect(props.onChoice).toHaveBeenCalledWith({ kind: "neverAsk" });
  });

  it("flips to the edit view when 'Set directory' is clicked", () => {
    render(<NoDirPopup {...defaults()} />);
    fireEvent.click(screen.getByRole("button", { name: /set directory/i }));
    expect(screen.getByRole("button", { name: /save & download/i })).toBeTruthy();
  });

  it("emits { kind: 'setDirectory', directory } on save", () => {
    const props = defaults();
    render(<NoDirPopup {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /set directory/i }));

    // The input exists only in edit view; find it by placeholder.
    const input = screen.getByPlaceholderText(/instagram\/alice/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "custom/alice" } });
    fireEvent.click(screen.getByRole("button", { name: /save & download/i }));
    expect(props.onChoice).toHaveBeenCalledWith({
      kind: "setDirectory",
      directory: "custom/alice",
    });
  });

  it("ignores save with an empty directory", () => {
    const props = defaults();
    render(<NoDirPopup {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /set directory/i }));
    const input = screen.getByPlaceholderText(/instagram\/alice/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save & download/i }));
    expect(props.onChoice).not.toHaveBeenCalled();
  });

  it("fires onCancel on Escape keypress", () => {
    const props = defaults();
    render(<NoDirPopup {...props} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onCancel).toHaveBeenCalled();
  });

  it("hovering the info glyph inside 'Download to' shows a tooltip about the default directory", () => {
    render(<NoDirPopup {...defaults()} />);
    const trigger = screen.getByTestId("info-tooltip-default");
    fireEvent.mouseEnter(trigger);
    // aria-hidden wrapper pulls the tooltip out of the a11y tree (intentional —
    // keeps the outer <button> accessible name clean). `hidden: true` queries the DOM directly.
    const tooltip = within(trigger).getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent ?? "").toMatch(/default directory/i);
  });

  it("hovering the info glyph inside 'Never ask' shows a tooltip about the never-ask list", () => {
    render(<NoDirPopup {...defaults()} />);
    const trigger = screen.getByTestId("info-tooltip-neverask");
    fireEvent.mouseEnter(trigger);
    const tooltip = within(trigger).getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent ?? "").toMatch(/never-ask list/i);
  });

  it("omits the removed prompt copy", () => {
    render(<NoDirPopup {...defaults()} />);
    expect(screen.queryByText(/choose where this download should land/i)).toBeNull();
  });
});
