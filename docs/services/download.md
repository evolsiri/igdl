# DownloadService

Thin client-side service that content scripts and the options page use to request downloads. It composes filename + directory on the client, sends a `DOWNLOAD_MEDIA` message, and the background worker does the actual `chrome.downloads.download` call (TAC-4.1).

## Files

| Path | Role |
|---|---|
| `src/services/download/download.ts` | `DownloadService` interface + `createDownloadService` — sends DOWNLOAD_MEDIA. |
| `src/services/download/naming.ts` | `buildFilename`, `resolveDirectory`, `buildFullPath` — pure, fully unit-tested. |

## Client API

### `queue(resource, options?): Promise<{ ok: true; downloadId } | { ok: false; error }>`

Sends a `DOWNLOAD_MEDIA` message with the resource. Never throws — surfaces transport errors as `{ ok: false }`.

| Option | Type | Default | Effect |
|---|---|---|---|
| `saveAs` | `boolean` | `false` | When `true`, forwards `saveAs: true` to `chrome.downloads.download`, prompting the OS Save As dialog. Used by right-click. |

```ts
// Normal download
const download = createDownloadService();
const result = await download.queue(resource);
// Right-click / Save As
const result = await download.queue(resource, { saveAs: true });
if (result.ok) toast.success("Downloaded");
else toast.failure(result.error);
```

## Naming helpers (pure functions)

### `buildFilename(resource, settings, now?): string`

Interpolates the filename template with `{username}`, `{id}`, `{type}`, `{datetime}` placeholders. Applies:
- `datetimeFormat` via Day.js tokens (see `src/utils/date.ts`).
- `enableDatetimeFormat` toggle — when off, `{datetime}` expands to empty.
- Separator cleanup — strips leading/trailing `-_.` and collapses runs.
- `sanitizeFilename` — replaces illegal chars with underscores (see `src/utils/path.ts`).
- `useCarouselIndexing` — appends `_<index>` when `resource.index` is set.
- `replaceJpegWithJpg` — normalizes extension.

```ts
buildFilename(
  { username: "alice", id: "ABC", type: "post", extension: "jpeg", index: 2, ... },
  { ...SETTINGS_DEFAULTS, filenameTemplate: "{username}-{id}-{datetime}" },
  new Date("2026-04-16T15:07:42"),
);
// → "alice-ABC-20260416_150742_2.jpg"
```

### `resolveDirectory(username, settings): string`

Returns the per-profile directory when present (case-insensitive match on `profileDirectories`), else `defaultDownloadDirectory`. Never includes a trailing slash.

### `buildFullPath(resource, settings, now?): string`

`joinPath(resolveDirectory(...), buildFilename(...))` — the final relative path for `chrome.downloads.download`'s `filename` field.

## Message flow

```
content handler ─▶ DownloadService.queue ─▶ sendMessage(DOWNLOAD_MEDIA)
                                                     │
                                                     ▼
                                       background/shared/router.ts
                                                     │
                                                     ▼
                                     handleDownloadMedia (shared/downloads.ts)
                                                     │
                                                     ├─▶ buildFullPath
                                                     ├─▶ chrome.downloads.download
                                                     └─▶ SettingsService.incrementDownload
```

## Consumers

- `src/content/flow/download.tsx` — `handleDownloadClick` calls `download.queue(r)` for each resolved resource.
- (Future) Options page "test download" if we add one — currently not used in the options UI.

## Tests

- `src/services/download/__tests__/naming.spec.ts` — exhaustive template / extension / index / dir-resolution cases.
- `src/background/shared/__tests__/downloads.spec.ts` — end-to-end for `handleDownloadMedia` (chrome.downloads.download + settings increment + error path + alwaysPromptSaveAs respected).
