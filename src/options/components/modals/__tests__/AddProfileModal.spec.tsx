import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddProfileModal } from "../AddProfileModal";

afterEach(cleanup);

describe("AddProfileModal", () => {
  it("pre-populates the directory field with initialDirectory", () => {
    render(
      <AddProfileModal
        open
        initialDirectory="instagram/"
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    const dirInput = screen.getByLabelText(/download directory/i) as HTMLInputElement;
    expect(dirInput.value).toBe("instagram/");
  });

  it("shows a validation error when username is empty", () => {
    render(
      <AddProfileModal
        open
        initialDirectory=""
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/required/i);
  });

  it("submits the trimmed username plus directory", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <AddProfileModal
        open
        initialDirectory="instagram/"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.input(screen.getByLabelText(/instagram username/i), {
      target: { value: "  Alice  " },
    });
    fireEvent.input(screen.getByLabelText(/download directory/i), {
      target: { value: "instagram/alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        username: "Alice",
        directory: "instagram/alice",
      }),
    );
  });

  it("surfaces the onSubmit error inside the modal", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("already exists");
    });
    render(
      <AddProfileModal
        open
        initialDirectory="instagram/"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.input(screen.getByLabelText(/instagram username/i), {
      target: { value: "alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("already exists"),
    );
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <AddProfileModal
        open
        initialDirectory=""
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
