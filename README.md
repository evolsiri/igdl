# igdl

An Instagram and Threads media downloader extension for Chrome and Firefox, with per-profile download directories, a polished settings page, and more. Heavily inspired by [instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension).

## Browser extension

Pre-built zips for each release are attached to the [latest GitHub Release](https://github.com/evolsiri/igdl/releases/latest).

### Chrome

1. Download **`igdl-chrome-<version>.zip`** from the [latest release](https://github.com/evolsiri/igdl/releases/latest).
2. Unzip it to a folder you won't move or delete (e.g. `~/extensions/igdl-chrome/`). Chrome loads the extension from this folder every startup.
3. Open `chrome://extensions/` and enable **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. Pin the igdl icon to the toolbar. Click it to open the settings page.

To update, download the new zip, replace the folder contents, then click **Reload** on the extension card in `chrome://extensions/`.

### Firefox

**Permanent install (recommended)** — signed by Mozilla, survives Firefox restarts.

1. Download **`igdl-firefox-<version>.xpi`** from the [latest release](https://github.com/evolsiri/igdl/releases/latest).
2. Open `about:addons` → click the gear icon ⚙ in the top right → **Install Add-on From File…**.
3. Pick the downloaded `.xpi` and confirm the install prompt.
4. Click the igdl toolbar icon to open the settings page.

To update, download the new `.xpi` from the latest release and install it the same way — Firefox replaces the previous version in place.

**Temporary install (fallback)** — if a given release only attaches the `.zip`, or you just want a one-off run. Add-ons installed this way disappear on Firefox restart.

1. Download **`igdl-firefox-<version>.zip`** from the [latest release](https://github.com/evolsiri/igdl/releases/latest).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the downloaded `.zip` (no need to unzip).
4. Click the igdl toolbar icon to open the settings page.

## Development

### Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- Chrome for `build:chrome` / Chrome Web Store distribution
- Firefox 115 or newer for `build:firefox` / Mozilla AMO distribution

### Install

```bash
pnpm install
```

### Commands

| Command                    | What it does                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm run dev`             | Vite dev server for iterating on the options page in isolation                        |
| `pnpm run dev:chrome`      | Watch-mode build into `dist/chrome/`; reload unpacked in `chrome://extensions/`       |
| `pnpm run dev:firefox`     | `web-ext run` auto-reloads a disposable Firefox profile against `dist/firefox/`       |
| `pnpm run build`           | Production build for both browsers                                                    |
| `pnpm run build:chrome`    | Production build to `dist/chrome/`                                                    |
| `pnpm run build:firefox`   | Production build to `dist/firefox/`                                                   |
| `pnpm run package:chrome`  | Zip `dist/chrome/` to `artifacts/igdl-chrome-<version>.zip` (Chrome Web Store upload) |
| `pnpm run package:firefox` | `web-ext build` to `artifacts/igdl-firefox-<version>.zip` (Mozilla AMO upload)        |
| `pnpm run sign:firefox`    | Sign `dist/firefox/` via the AMO API to `artifacts/igdl-firefox-<version>.xpi`        |
| `pnpm run rc:firefox`      | End-to-end Firefox release candidate: bump version → build → package → sign → tag    |
| `pnpm run preview`         | Vite preview server                                                                   |
| `pnpm run lint`            | ESLint (zero warnings required)                                                       |
| `pnpm run test`            | Vitest headless                                                                       |

### Load unpacked — Chrome

1. `pnpm run build:chrome`
2. Open `chrome://extensions/` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/chrome/` directory.
4. Pin the igdl icon to the toolbar. Clicking it opens the options page in a new tab.

For iteration, leave `pnpm run dev:chrome` running — it rebuilds on file change; you still click **Reload** on the extension card in `chrome://extensions/` to pick up changes.

### Load unpacked — Firefox

1. `pnpm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.
4. Click the igdl toolbar icon to open the options page.

Or run `pnpm run dev:firefox` to launch a disposable Firefox profile that auto-reloads on every rebuild.

#### Developing on WSL2

`web-ext run` and `pnpm run dev:firefox` don't work from WSL2 because Firefox for Windows can't read files from the WSL filesystem (`\\wsl.localhost\...` paths). Use the dedicated watch script instead:

```bash
pnpm run dev:firefox:win
```

This builds `dist/firefox/` and copies it to `C:\temp\igdl-ext\` on every `src/` change. Load it once in Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** → select `C:\temp\igdl-ext\manifest.json`
3. After each save, click **Reload** on the extension card — the watch script copies the new build automatically.

> **Pitfall — addon ID conflict:** if you previously installed a signed XPI of igdl (`igdl@evolsiri.local`), Firefox will load both the signed and temporary extensions under the same ID. Remove the signed version from `about:addons` before loading the temp extension to avoid silent conflicts where one disables the other.

> **Pitfall — Firefox manifest properties:** `externally_connectable` is Chrome-only. Including it in `firefox.manifest.json` causes Firefox to silently refuse to inject content scripts (no error, no warning beyond the manifest parse log). Keep Firefox-incompatible properties out of `firefox.manifest.json` even if they look harmless.

### Docs

Deeper documentation lives under [`docs/`](./docs/).

## License

MIT © 2026 evolsiri. See [`LICENSE`](./LICENSE).
