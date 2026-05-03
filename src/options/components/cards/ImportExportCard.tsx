import { useRef, useState } from "preact/hooks";
import { SETTINGS_DEFAULTS } from "../../../services/settings/schema";
import type { Settings } from "../../../types/settings";
import { Card } from "../Card";

export interface ImportExportCardProps {
  /** Returns the current settings to be serialized. */
  onExport: () => Promise<Settings>;
  /**
   * Receives the parsed import payload after unrecognized keys have been
   * stripped. Implementations should pass it to `SettingsService.set` so the
   * schema layer normalizes types and fills any missing fields with defaults.
   */
  onImport: (parsed: Record<string, unknown>) => Promise<void>;
}

const KNOWN_SETTING_KEYS = new Set<string>(Object.keys(SETTINGS_DEFAULTS));

/**
 * Card with two buttons:
 *
 * - **Export** serializes the current settings via `onExport` and triggers a
 *   browser download of an `igdl-settings-<timestamp>.json` file.
 * - **Import** opens a hidden file picker. When a file is chosen it is read,
 *   `JSON.parse`d, and forwarded to `onImport` after dropping any keys that
 *   are not in `SETTINGS_DEFAULTS`. Failures are silent toward the user — the
 *   only feedback is a `console.warn` line:
 *   - invalid JSON → `console.warn` and abort, settings untouched
 *   - JSON root that is not a plain object → `console.warn` and abort
 *   - unknown keys → `console.warn` listing them, then forward the rest
 *
 * The recognized payload still flows through `SettingsService.set` (in App),
 * so the schema layer fills missing fields with defaults and coerces invalid
 * value types — the card does not perform per-field validation itself.
 */
export function ImportExportCard({ onExport, onImport }: ImportExportCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const settings = await onExport();
      const json = JSON.stringify(settings, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildExportFilename(new Date());
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-selecting the same file
    if (!file) return;

    setBusy(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        console.warn("[igdl] Settings import failed: invalid JSON.", err);
        return;
      }
      if (!isPlainObject(parsed)) {
        console.warn(
          "[igdl] Settings import failed: file does not contain a settings object.",
        );
        return;
      }
      const filtered: Record<string, unknown> = {};
      const unknownKeys: string[] = [];
      for (const key of Object.keys(parsed)) {
        if (KNOWN_SETTING_KEYS.has(key)) {
          filtered[key] = parsed[key];
        } else {
          unknownKeys.push(key);
        }
      }
      if (unknownKeys.length > 0) {
        console.warn("[igdl] Dropping unrecognized settings keys:", unknownKeys);
      }
      await onImport(filtered);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Import / Export"
      subtitle="Save the current settings as JSON, or load a previously exported file. Importing replaces your current settings."
      id="import-export"
      testId="import-export-card"
    >
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          class="px-4 py-2 border border-border text-fg hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="export-settings"
        >
          Export settings
        </button>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={busy}
          class="px-4 py-2 border border-border text-fg hover:bg-surface-hover transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="import-settings"
        >
          Import settings
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          class="sr-only"
          onChange={handleFileSelected}
          aria-hidden="true"
          tabIndex={-1}
          data-testid="import-settings-file"
        />
      </div>
    </Card>
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildExportFilename(now: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `igdl-settings-${stamp}.json`;
}
