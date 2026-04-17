import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../ConfirmDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        open
        title="Delete alice?"
        message="Last chance."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: /delete alice\?/i })).toBeTruthy();
    expect(screen.getByText(/last chance/i)).toBeTruthy();
  });

  it("fires onConfirm when Confirm is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="X"
        confirmLabel="Yes"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="X"
        cancelLabel="No"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses destructive-labeled confirm button text when destructive=true", () => {
    render(
      <ConfirmDialog
        open
        title="X"
        confirmLabel="Nuke it"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Nuke it" })).toBeTruthy();
  });
});
