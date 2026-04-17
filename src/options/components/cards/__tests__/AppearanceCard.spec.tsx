import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceCard } from "../AppearanceCard";

afterEach(cleanup);

describe("AppearanceCard", () => {
  it("renders all three theme options with correct checked state", () => {
    render(<AppearanceCard theme="dark" onChange={() => {}} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.find((r) => r.value === "dark")?.checked).toBe(true);
    expect(radios.find((r) => r.value === "light")?.checked).toBe(false);
    expect(radios.find((r) => r.value === "system")?.checked).toBe(false);
  });

  it("fires onChange with the new value when a different option is clicked", () => {
    const onChange = vi.fn();
    render(<AppearanceCard theme="system" onChange={onChange} />);
    const lightRadio = screen
      .getAllByRole("radio")
      .find((r) => (r as HTMLInputElement).value === "light")!;
    fireEvent.click(lightRadio);
    expect(onChange).toHaveBeenCalledWith("light");
  });
});
