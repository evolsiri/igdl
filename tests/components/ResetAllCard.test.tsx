import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetAllCard } from "../../src/options/components/cards/ResetAllCard";

afterEach(cleanup);

describe("ResetAllCard", () => {
  it("opens the confirmation dialog when the reset button is clicked", () => {
    render(<ResetAllCard onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /reset all settings/i }));
    expect(screen.getByRole("heading", { name: /reset all settings\?/i })).toBeTruthy();
  });

  it("calls onReset when Reset everything is confirmed", async () => {
    const onReset = vi.fn(async () => undefined);
    render(<ResetAllCard onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /reset all settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset everything/i }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
  });

  it("does not call onReset when cancel is clicked", () => {
    const onReset = vi.fn();
    render(<ResetAllCard onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /reset all settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onReset).not.toHaveBeenCalled();
  });
});
