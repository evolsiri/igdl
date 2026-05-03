import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_DEFAULTS } from "../../../../services/settings/schema";
import type { Settings } from "../../../../types/settings";
import { ImportExportCard } from "../ImportExportCard";

afterEach(cleanup);

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...SETTINGS_DEFAULTS, ...overrides };
}

function selectFile(input: HTMLInputElement, text: string, name = "settings.json") {
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("ImportExportCard", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let createUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeUrlSpy: ReturnType<typeof vi.spyOn>;
  let anchorClickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:mock");
    revokeUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    // Block real navigation while still letting us count clicks.
    anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        // no-op
      });
  });

  describe("export", () => {
    it("serializes the current settings as JSON and triggers a download", async () => {
      const onExport = vi.fn(async () => settings({ theme: "dark" }));
      render(<ImportExportCard onExport={onExport} onImport={vi.fn()} onReset={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /export settings/i }));

      await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(anchorClickSpy).toHaveBeenCalledTimes(1));

      // Blob payload was the JSON-serialized settings
      const blob = createUrlSpy.mock.calls[0][0] as Blob;
      const text = await blob.text();
      expect(JSON.parse(text)).toEqual(settings({ theme: "dark" }));
      expect(blob.type).toBe("application/json");

      // Object URL is released after the click
      expect(revokeUrlSpy).toHaveBeenCalledWith("blob:mock");
    });

    it("uses an .json filename containing the igdl-settings prefix", async () => {
      const onExport = vi.fn(async () => settings());
      render(<ImportExportCard onExport={onExport} onImport={vi.fn()} onReset={vi.fn()} />);

      // Capture the anchor at click time so we can read its `download` attr.
      let anchorDownload: string | undefined;
      anchorClickSpy.mockImplementation(function (this: HTMLAnchorElement) {
        anchorDownload = this.download;
      });

      fireEvent.click(screen.getByRole("button", { name: /export settings/i }));

      await waitFor(() => expect(anchorClickSpy).toHaveBeenCalled());
      expect(anchorDownload).toMatch(/^igdl-settings-\d{8}_\d{6}\.json$/);
    });
  });

  describe("import", () => {
    it("parses a valid file and forwards every recognized key to onImport", async () => {
      const onImport = vi.fn(async () => undefined);
      render(<ImportExportCard onExport={vi.fn()} onImport={onImport} onReset={vi.fn()} />);

      const input = screen.getByTestId("import-settings-file") as HTMLInputElement;
      const payload = JSON.stringify({
        theme: "light",
        defaultDownloadDirectory: "ig",
        enableThreadsSupport: false,
      });
      selectFile(input, payload);

      await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
      expect(onImport).toHaveBeenCalledWith({
        theme: "light",
        defaultDownloadDirectory: "ig",
        enableThreadsSupport: false,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("silently fails (logs only) when the file is not valid JSON", async () => {
      const onImport = vi.fn();
      render(<ImportExportCard onExport={vi.fn()} onImport={onImport} onReset={vi.fn()} />);

      const input = screen.getByTestId("import-settings-file") as HTMLInputElement;
      selectFile(input, "{not valid json");

      await waitFor(() => expect(warnSpy).toHaveBeenCalled());
      expect(onImport).not.toHaveBeenCalled();
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/invalid JSON/i);
    });

    it("silently fails when the JSON root is not an object", async () => {
      const onImport = vi.fn();
      render(<ImportExportCard onExport={vi.fn()} onImport={onImport} onReset={vi.fn()} />);

      const input = screen.getByTestId("import-settings-file") as HTMLInputElement;
      selectFile(input, JSON.stringify(["theme", "dark"]));

      await waitFor(() => expect(warnSpy).toHaveBeenCalled());
      expect(onImport).not.toHaveBeenCalled();
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/settings object/i);
    });

    it("drops unrecognized keys, logs them, and forwards the rest", async () => {
      const onImport = vi.fn(async () => undefined);
      render(<ImportExportCard onExport={vi.fn()} onImport={onImport} onReset={vi.fn()} />);

      const input = screen.getByTestId("import-settings-file") as HTMLInputElement;
      const payload = JSON.stringify({
        theme: "dark",
        bogusKey: "value",
        anotherUnknown: 42,
      });
      selectFile(input, payload);

      await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
      expect(onImport).toHaveBeenCalledWith({ theme: "dark" });

      // Check we logged the unknown key list
      const dropCall = warnSpy.mock.calls.find((c: unknown[]) =>
        typeof c[0] === "string" && /unrecognized/i.test(c[0]),
      );
      expect(dropCall).toBeTruthy();
      expect(dropCall?.[1]).toEqual(["bogusKey", "anotherUnknown"]);
    });

    it("does nothing when the file picker is dismissed without a selection", async () => {
      const onImport = vi.fn();
      render(<ImportExportCard onExport={vi.fn()} onImport={onImport} onReset={vi.fn()} />);

      const input = screen.getByTestId("import-settings-file") as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [], configurable: true });
      fireEvent.change(input);

      // Give async handler a tick to run.
      await Promise.resolve();
      expect(onImport).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
