import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsCard } from "../DownloadsCard";
import { SETTINGS_DEFAULTS } from "../../../../services/settings/schema";
import type { Settings } from "../../../../types/settings";

afterEach(cleanup);

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...SETTINGS_DEFAULTS, ...overrides };
}

describe("DownloadsCard", () => {
  it("renders all 13 settings by default", () => {
    render(<DownloadsCard settings={makeSettings()} onPatch={() => {}} />);
    // 13 settings = 3 text fields + 10 toggles (labels appear exactly once each)
    expect(screen.getByLabelText("Default download directory")).toBeTruthy();
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

  it("emits onPatch with the new value when a non-directory TextField changes", () => {
    const onPatch = vi.fn();
    render(<DownloadsCard settings={makeSettings()} onPatch={onPatch} />);
    const input = screen.getByLabelText("Filename template");
    fireEvent.input(input, { target: { value: "{username}-{id}" } });
    expect(onPatch).toHaveBeenCalledWith({ filenameTemplate: "{username}-{id}" });
  });

  it("does not patch directory fields while typing; saves on blur", () => {
    const onPatch = vi.fn();
    render(<DownloadsCard settings={makeSettings()} onPatch={onPatch} />);
    const input = screen.getByLabelText("Default download directory");
    fireEvent.input(input, { target: { value: "downloads/igdl/" } });
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith({ defaultDownloadDirectory: "downloads/igdl" });
  });

  it("strips trailing slashes from directory fields on blur", () => {
    const onPatch = vi.fn();
    render(<DownloadsCard settings={makeSettings()} onPatch={onPatch} />);
    const input = screen.getByLabelText("Prefix");
    fireEvent.input(input, { target: { value: "instagram///" } });
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith({ prefix: "instagram" });
  });

  it("patches the reset value immediately when a directory reset button is clicked", () => {
    const onPatch = vi.fn();
    render(<DownloadsCard settings={makeSettings({ defaultDownloadDirectory: "custom/dir" })} onPatch={onPatch} />);
    fireEvent.click(screen.getAllByTitle(`Reset to default: ${SETTINGS_DEFAULTS.defaultDownloadDirectory}`)[0]);
    expect(onPatch).toHaveBeenCalledWith({
      defaultDownloadDirectory: SETTINGS_DEFAULTS.defaultDownloadDirectory,
    });
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
