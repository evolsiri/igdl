<p align="center">
  <img src="public/logo.svg" width="96" height="96" alt="igdl" />
</p>

# igdl

A Chrome and Firefox extension that adds a download button to Instagram and Threads. Click, save. No accounts, no servers, no ads.

Inspired by [instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension), with the difference that igdl can sort downloads into per-profile folders so your Downloads folder doesn't turn into chaos.

## What you can save

- **Posts** — single images, videos, and full carousels.
- **Reels** — feed and detail pages.
- **Stories** — including the active story you're watching.
- **Highlights** — every item in a profile's saved highlights.
- **Profile pictures** — full-resolution avatars.
- **Threads posts** — text, images, video.

Carousels can be saved as individual files or bundled into a single `.zip` with one click.

## Install

Pre-built downloads are attached to the [latest GitHub Release](https://github.com/evolsiri/igdl/releases/latest). The extension is not in the Chrome Web Store or on AMO yet — you'll sideload it.

### Chrome / Edge / Brave

1. Download **`igdl-chrome-<version>.zip`** from the [latest release](https://github.com/evolsiri/igdl/releases/latest).
2. Unzip it somewhere stable — Chrome loads the extension from this folder every time you start the browser, so don't delete or move it. Something like `~/extensions/igdl/` works well.
3. Open `chrome://extensions/` and flip on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder.
5. Pin the igdl icon to the toolbar. Clicking it opens the settings page.

To update: download the new zip, replace the folder contents, then click **Reload** on the extension card in `chrome://extensions/`.

### Firefox

1. Download **`igdl-firefox-<version>.xpi`** from the [latest release](https://github.com/evolsiri/igdl/releases/latest).
2. Open `about:addons` → click the gear ⚙ in the top right → **Install Add-on From File…**.
3. Pick the downloaded `.xpi` and confirm.
4. Click the igdl toolbar icon to open the settings page.

To update: download the new `.xpi` and install it the same way.

## How to use it

Once installed, just visit Instagram or Threads. A download button appears next to the like icon on every post, reel, story, highlight, and profile. Click it to save, or right-click for your browser's Save As dialog. An optional second button opens the media in a new tab instead of downloading it. The first time you save from a given profile, igdl asks where to put the files; after that it remembers.

### Per-profile folders

Under **Profile Download Directories** in the settings page, you can pick a folder for each Instagram user you follow. The next time you download something from `@alice`, it lands in `instagram/alice/` (or whatever you set). Default is one shared `instagram/` folder.

### Filename templates

Files are named using a template you can customize. The default is:

```
{username}-{id}-{datetime}
```

Available tokens: `{username}`, `{id}`, `{type}`, `{datetime}`. Datetime format follows [Day.js](https://day.js.org/docs/en/display/format) (default: `YYYYMMDD_HHmmss`).

A feed post by `@alice` saved with the defaults becomes:

```
instagram/alice/alice-ABC-20260416_150742.jpg
```

Carousels add a numeric suffix: `..._1.jpg`, `..._2.jpg`, …

### Carousel ZIP

Multi-image posts get a second download button that bundles every item into a single `.zip`. Useful when you want the whole set in one save.

### Never-Ask list

For profiles where you'd rather always pick the destination yourself, add them to the **Never-Ask Profiles** list. igdl will skip the folder prompt and let your browser's regular Save dialog handle it.

### Backing up your settings

Under **Settings** in the options page you can export everything — your profile directories, filename template, and preferences — to a `.json` file. Import it again any time to restore, such as after reinstalling the browser or switching machines.

## Privacy

igdl runs **only** on `instagram.com` and `threads.com`. It cannot read or modify any other site. There are no servers, no analytics, no telemetry — your settings and per-profile folder list live in your browser's local storage and never leave the device. The permissions it requests:

- **Storage** — to remember your settings, per-profile folders, and skip-prompt list.
- **Downloads** — to save files where you tell it to.
- **Access to instagram.com and threads.com** — to add the download button and read the media URLs Instagram serves to you.

## Building from source

If you want to run a development build or contribute:

```sh
pnpm install
pnpm run build:chrome   # → dist/chrome/
pnpm run build:firefox  # → dist/firefox/
```

See [`docs/development.md`](./docs/development.md) for the full setup and [`docs/`](./docs/) for everything else.

## License

MIT © [evolsiri](https://github.com/evolsiri). See [`LICENSE`](./LICENSE).
