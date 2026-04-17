import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsCard } from "../../src/options/components/cards/DownloadsCard";
import { SETTINGS_DEFAULTS } from "../../src/services/SettingsService/schema";
import type { Settings } from "../../src/types/settings";

afterEach(cleanup);

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...SETTINGS_DEFAULTS, ...overrides };
}

describe("DownloadsCard", () => {
  it("renders all 14 settings by default", () => {
    render(<DownloadsCard settings={makeSettings()} onPatch={() => {}} />);
    // 14 settings = 4 text fields + 10 toggles (labels appear exactly once each)
    expect(screen.getByLabelText("Default download directory")).toBeTruthy();
    expect(screen.getByLabelText("Base directory")).toBeTruthy();
    expect(screen.getByLabelText("Prefix")).toBeTruthy();
    expect(screen.getByLabelText("Always prompt Save As")).toBeTruthy();
    expect(screen.getByLabelText("Filename template")).toBeTruthy();
    expect(screen.getByLabelText("Datetime format")).toBeTruthy();
    expect(screen.getByLabelText("Include datetime in filenames")).toBeTruthy();
    expect(screen.getByLabelText("Replace .jpeg with .jpg")).toBeTruthy();
    expect(screen.getByLabelText("Index carousel items")).toBeTruthy();
    expect(screen.getByLabelText('Show "open in new tab" icon')).toBeTruthy();
    expect(screen.getByLabelText('Show "ZIP download" icon')).toBeTruthy();
    expect(screen.getByLabelText("Threads.com support")).toBeTruthy();
    expect(screen.getByLabelText("Enhanced video controls")).toBeTruthy();
    expect(screen.getByLabelText("Explore video clickthrough")).toBeTruthy();
  });

  it("filters settings by search query", () => {
    render(<DownloadsCard settings={makeSettings()} onPatch={() => {}} />);
    const search = screen.getByRole("searchbox", { name: /search downloads/i });
    fireEvent.input(search, { target: { value: "threads" } });
    const list = screen.getByTestId("downloads-list");
    expect(within(list).getByLabelText("Threads.com support")).toBeTruthy();
    expect(within(list).queryByLabelText("Default download directory")).toBeNull();
  });

  it("shows all settings when the query matches zero items (per PAC-4.3)", () => {
    render(<DownloadsCard settings={makeSettings()} onPatch={() => {}} />);
    const search = screen.getByRole("searchbox", { name: /search downloads/i });
    fireEvent.input(search, { target: { value: "zzzzzzzzzz" } });
    const list = screen.getByTestId("downloads-list");
    expect(within(list).getByLabelText("Default download directory")).toBeTruthy();
    expect(within(list).getByLabelText("Threads.com support")).toBeTruthy();
  });

  it("emits onPatch with the new field when a TextField changes", () => {
    const onPatch = vi.fn();
    render(<DownloadsCard settings={makeSettings()} onPatch={onPatch} />);
    const input = screen.getByLabelText("Default download directory");
    fireEvent.input(input, { target: { value: "downloads/igdl" } });
    expect(onPatch).toHaveBeenCalledWith({ defaultDownloadDirectory: "downloads/igdl" });
  });

  it("emits onPatch with the new value when a Toggle changes", () => {
    const onPatch = vi.fn();
    render(
      <DownloadsCard
        settings={makeSettings({ enableThreadsSupport: true })}
        onPatch={onPatch}
      />,
    );
    const toggle = screen.getByLabelText("Threads.com support");
    fireEvent.click(toggle);
    expect(onPatch).toHaveBeenCalledWith({ enableThreadsSupport: false });
  });
});
