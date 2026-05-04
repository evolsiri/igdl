import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "../Toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Toast", () => {
  it("renders a success toast with the checkmark glyph and message", () => {
    render(<Toast kind="success" message="Downloaded alice.jpg" onDismiss={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Downloaded alice.jpg");
    expect(screen.getByRole("status").textContent).toContain("✓");
  });

  it("renders a failure toast with the x glyph and alert role", () => {
    render(<Toast kind="failure" message="boom" onDismiss={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("boom");
    expect(screen.getByRole("alert").textContent).toContain("✕");
  });

  it("renders an info toast with the i glyph and status role", () => {
    render(<Toast kind="info" message="Download canceled" onDismiss={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Download canceled");
    expect(screen.getByRole("status").textContent).toContain("i");
  });

  it("renders a loading toast with an SVG spinner and does not auto-dismiss", () => {
    const onDismiss = vi.fn();
    render(
      <Toast kind="loading" message="Building zip…" durationMs={Infinity} onDismiss={onDismiss} />,
    );
    const el = screen.getByRole("status");
    expect(el.textContent).toContain("Building zip…");
    expect(el.querySelector("svg")).not.toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss after durationMs + transition tail", () => {
    const onDismiss = vi.fn();
    render(<Toast kind="success" message="x" durationMs={1000} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1249); // durationMs(1000) + safety(250) - 1ms: not yet
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);    // exactly at boundary (1250)
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders a progress bar for finite-duration toasts", () => {
    const { container } = render(<Toast kind="success" message="ok" durationMs={1000} onDismiss={() => {}} />);
    // Progress bar wrapper is a div[aria-hidden], distinct from loading's svg[aria-hidden]
    expect(container.querySelector('div[aria-hidden="true"]')).not.toBeNull();
  });

  it("does not render a progress bar for loading toasts", () => {
    const { container } = render(
      <Toast kind="loading" message="Building zip…" durationMs={Infinity} onDismiss={() => {}} />,
    );
    expect(container.querySelector('div[aria-hidden="true"]')).toBeNull();
  });
});
