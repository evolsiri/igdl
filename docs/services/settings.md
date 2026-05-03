# SettingsService

Owns the user-facing settings blob at `chrome.storage.local["igdl_settings"]`. Every module that reads or writes settings goes through this service — direct `chrome.storage.*` access is prohibited everywhere else (TAC-4.3).

## Files

| Path | Role |
|---|---|
| `src/services/settings/settings.ts` | Public API + `createSettingsService`. |
| `src/services/settings/schema.ts` | `SETTINGS_DEFAULTS`, `normalize`, `migrate` (forward-only). |
| `src/services/settings/storage.ts` | `KvStorage` interface, `chromeStorageLocal()`, `inMemoryStorage()` for tests. Shared with `MediaCacheService`. |
| `src/types/settings.ts` | `Settings`, `ProfileDirEntry`, `NeverAskEntry`, `ThemeSetting`, `ProfileDirectoriesSort`. |

## Public API

### `get(): Promise<Settings>`

Returns the current settings, normalized through `migrate()`. Returns a fresh `SETTINGS_DEFAULTS` when storage has no prior blob.

```ts
const settings = await service.get();
console.log(settings.theme); // "system"
```

### `set(settings): Promise<void>`

Replaces the entire blob. Inputs are re-normalized on the way in.

```ts
await service.set({ ...current, theme: "dark" });
```

### `patch(partial): Promise<Settings>`

Merges a partial update and returns the result. `schemaVersion` is always clamped to `1`.

```ts
const next = await service.patch({ theme: "light", enableThreadsSupport: false });
```

### `addProfile({ username, directory }): Promise<ProfileDirEntry>`

Adds a new per-profile directory entry. Username is trimmed + lowercased before storage. Timestamps (`addedAt`, `lastEditedAt`) are stamped; `downloadCount` starts at 0; `lastDownloadAt` is `null`.

Throws if the username already exists.

```ts
await service.addProfile({ username: "Alice", directory: "instagram/alice" });
```

### `updateProfile(username, fields): Promise<ProfileDirEntry>`

Edits an existing row. Updates `lastEditedAt` unconditionally. Renaming to an existing username throws. Lookup on the original `username` is case-insensitive.

```ts
await service.updateProfile("alice", { directory: "ig/alice-new" });
```

### `deleteProfile(username): Promise<void>`

Removes a row. No-op if the username isn't present.

### `incrementDownload(username): Promise<void>`

Bumps `downloadCount` and updates `lastDownloadAt`. No-op when the profile has no row (user downloaded to the default directory).

### `setProfileDirectoriesSort(sort): Promise<void>`

Persists the active sort for the Profile Directories table (`{ key, direction }`). The card reads this back via the Settings snapshot and applies it to rows after filtering, so search respects the chosen sort. Default is `{ key: "addedAt", direction: "desc" }` — most recently added on top.

```ts
await service.setProfileDirectoriesSort({ key: "username", direction: "asc" });
```

### `addNeverAsk(username) / removeNeverAsk(username): Promise<void>`

Manages the never-ask list. `addNeverAsk` is idempotent. Both normalize the username. Opt-out and directory-config are orthogonal — a profile can have both a custom directory and a never-ask entry.

### `resetAll(): Promise<void>`

Writes `SETTINGS_DEFAULTS` verbatim. Idempotent. The options page's ResetAllCard combines this with `MediaCacheService.clearAll()`.

### `subscribe(listener): () => void`

Fires on every settings change, including cross-context writes (options ↔ content ↔ background) via `chrome.storage.onChanged`. Returns an unsubscribe function.

```ts
const off = service.subscribe((settings) => console.log(settings.theme));
// later
off();
```

## Migration policy

`schemaVersion` is pinned at 1 for v1. Future schema changes bump the version and add a branch to `migrate()` in `schema.ts`. The policy is forward-only, lossy-permissive: unknown fields from a future version are dropped, missing fields are filled from defaults. The canonical shape is the `Settings` type in `src/types/settings.ts`.

## Consumers

- **Options page** (`src/options/App.tsx`): subscribes, re-renders cards on change, threads Theme changes through to `ThemeService`. The Import / Export card calls `get()` to serialize settings to a JSON file, and `set()` with a key-filtered payload to apply an imported file (the schema layer fills missing fields with defaults and coerces invalid types).
- **Content-script download flow** (`src/content/flow/download.tsx`): reads to decide silent vs popup path; writes via `addProfile` / `addNeverAsk` after user choices.
- **Background download handler** (`src/background/shared/downloads.ts`): reads `alwaysPromptSaveAs`, calls `incrementDownload` after a successful `chrome.downloads.download`.

## Tests

`src/services/settings/__tests__/settings.spec.ts` — 30+ cases covering CRUD, migration forward-step scaffolding, idempotent reset, cross-context subscribe via external storage writes, never-ask add/remove, case-insensitive username semantics.

Inject an `inMemoryStorage()` (from `storage.ts`) when writing new tests — never hit `chrome.storage.local` from a test environment.
