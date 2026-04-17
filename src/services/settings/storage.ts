/**
 * `chrome.storage.local` adapter + in-memory fake, shared by `SettingsService`
 * and `MediaCacheService`. Per CLAUDE.md, direct `chrome.storage.*` calls only
 * live inside these two services — external modules go through the services.
 */

export interface StorageChangeSet {
  [key: string]: {
    newValue?: unknown;
    oldValue?: unknown;
  };
}

export interface KvStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  /** Subscribes to storage-change events from this adapter's backing store. Returns an unsubscribe function. */
  onChanged(listener: (changes: StorageChangeSet) => void): () => void;
}

/**
 * Wraps `chrome.storage.local` as a KvStorage. Fails fast if the chrome API
 * isn't available (non-extension environment) — tests should use `inMemoryStorage()`.
 *
 * @example
 * const storage = chromeStorageLocal();
 * await storage.set("igdl_settings", SETTINGS_DEFAULTS);
 */
export function chromeStorageLocal(): KvStorage {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("chromeStorageLocal: chrome.storage.local is unavailable; use inMemoryStorage() in non-extension environments.");
  }
  const area = chrome.storage.local;
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await area.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await area.remove(key);
    },
    async removeMany(keys: string[]): Promise<void> {
      if (keys.length === 0) return;
      await area.remove(keys);
    },
    onChanged(listener) {
      const wrapped = (changes: StorageChangeSet, areaName: string) => {
        if (areaName !== "local") return;
        listener(changes);
      };
      chrome.storage.onChanged.addListener(wrapped);
      return () => chrome.storage.onChanged.removeListener(wrapped);
    },
  };
}

/**
 * In-memory KvStorage for tests. Fully synchronous semantics wrapped in
 * resolved Promises. Subscribers are called synchronously within the
 * mutating call's microtask.
 *
 * @example
 * const storage = inMemoryStorage({ "igdl_settings": SETTINGS_DEFAULTS });
 * const service = createSettingsService({ storage });
 */
export function inMemoryStorage(initial: Record<string, unknown> = {}): KvStorage {
  const store = new Map<string, unknown>(Object.entries(initial));
  const listeners = new Set<(changes: StorageChangeSet) => void>();

  function emit(changes: StorageChangeSet): void {
    for (const listener of listeners) listener(changes);
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      const oldValue = store.get(key);
      store.set(key, value);
      emit({ [key]: { newValue: value, oldValue } });
    },
    async remove(key: string): Promise<void> {
      const oldValue = store.get(key);
      if (!store.has(key)) return;
      store.delete(key);
      emit({ [key]: { newValue: undefined, oldValue } });
    },
    async removeMany(keys: string[]): Promise<void> {
      const changes: StorageChangeSet = {};
      for (const key of keys) {
        if (!store.has(key)) continue;
        const oldValue = store.get(key);
        store.delete(key);
        changes[key] = { newValue: undefined, oldValue };
      }
      if (Object.keys(changes).length > 0) emit(changes);
    },
    onChanged(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
