# SettingsService

Single owner of `chrome.storage.local["igdl_settings"]`. Every module that reads or writes settings goes through this service — direct `chrome.storage.*` access is prohibited elsewhere (see `../code-style-guide.md`).

The settings blob is schema-versioned. `migrate()` on load and `normalize()` on save defend against hand-edited JSON imports.

## Public API

```ts
interface SettingsService {
  get(): Promise<Settings>;
  set(settings: Settings): Promise<void>;
  patch(partial: Partial<Settings>): Promise<Settings>;

  addProfile(input: AddProfileInput): Promise<ProfileDirEntry>;
  updateProfile(username: string, fields: UpdateProfileInput): Promise<ProfileDirEntry>;
  deleteProfile(username: string): Promise<void>;
  incrementDownload(username: string): Promise<void>;
  setProfileDirectoriesSort(sort: ProfileDirectoriesSort): Promise<void>;

  addNeverAsk(username: string): Promise<void>;
  removeNeverAsk(username: string): Promise<void>;

  resetAll(): Promise<void>;
  subscribe(listener: (settings: Settings) => void): () => void;
}

function createSettingsService(options?: SettingsServiceOptions): SettingsService;
```

| Method | What it does |
| --- | --- |
| `get` | Returns settings, normalized through migration. Returns `SETTINGS_DEFAULTS` if nothing is persisted yet. |
| `set` | Replaces the entire blob. Re-normalizes on the way in. |
| `patch` | Shallow merge + persist. Returns the merged result. |
| `addProfile` | Adds a profile-directory row. Username is `trim().toLowerCase()`. Throws if the username already exists. |
| `updateProfile` | Edits an existing row. Throws if the target username isn't found, or a renamed-to username already exists. |
| `deleteProfile` | Removes a row. No-op if missing. |
| `incrementDownload` | `downloadCount += 1`, `lastDownloadAt = now()` for the named profile. No-op if the profile has no row (i.e. the user downloaded to the default directory). |
| `setProfileDirectoriesSort` | Persists the active sort for the Profile Directories table. |
| `addNeverAsk` | Adds a username to the never-ask list. Idempotent. Does not affect any existing profile-directory row. |
| `removeNeverAsk` | Removes a username from the never-ask list. No-op if missing. |
| `resetAll` | Wipes everything; restores `SETTINGS_DEFAULTS`. |
| `subscribe` | Listener fires on every storage change to `igdl_settings`, including changes from other contexts (options page ↔ content script ↔ background). Returns an unsubscribe function. |

The `addedAt`, `lastEditedAt`, and `lastDownloadAt` timestamps are epoch ms produced by `options.now ?? Date.now`.

## Lifecycle

Singleton-per-context. The background instantiates one in `src/background/chrome.ts` / `firefox.ts`; the options page and content scripts each get their own. `subscribe()` is the cross-context glue — `chrome.storage.onChanged` events from any context propagate to every subscriber.

## Storage

Backed by `chrome.storage.local["igdl_settings"]` via the `KvStorage` adapter at `src/services/settings/storage.ts`. The adapter is the only place in the codebase that calls `chrome.storage.*`. Tests inject `inMemoryStorage()` from the same file.

The schema lives in `src/services/settings/schema.ts`:
- `SETTINGS_DEFAULTS` — the source of truth for default values.
- `migrate(raw)` — forward-only migrations from older schema versions.
- `normalize(settings)` — defensive normalization (lowercases usernames, dedupes lists, applies defaults to missing fields).

## Call sites

- `src/background/chrome.ts:11` — singleton instantiation.
- `src/background/shared/downloads.ts:22` — `get()` and `incrementDownload()` per download.
- `src/options/components/cards/*` — every options-page card reads via `subscribe()` and writes via `patch` / `addProfile` / etc.
- `src/content/extractors/storage.ts` — content-script projection that mirrors the blob into a synchronous `storageCache` for click handlers.
- `src/content/flow/download.tsx` — `addProfile` / `addNeverAsk` from the no-directory popup.

## Invariants

- One blob, one key. Don't add new top-level `chrome.storage.local` keys for settings — extend the `Settings` interface and bump `schemaVersion` instead.
- Username equality is case-insensitive everywhere. `addProfile`, `updateProfile`, `deleteProfile`, `incrementDownload`, `addNeverAsk`, `removeNeverAsk` all `trim().toLowerCase()` the input.
- Never-ask and profile-directory state are orthogonal. Adding to one doesn't remove from the other; the options-page UI handles the mutually-exclusive presentation.
