import type { Settings } from "../../types/settings";
import {
  createSettingsService,
  type SettingsService,
} from "../../services/settings/settings";

/**
 * Reference-shaped settings projection. The ported handlers read these keys
 * directly, so we expose them under the reference's names while our canonical
 * `Settings` keeps the camelCase shape. Adapter converts between the two.
 */
export interface StorageSettings {
  setting_show_open_in_new_tab_icon: boolean;
  setting_show_zip_download_icon: boolean;
  setting_enable_threads: boolean;
  setting_enable_video_controls: boolean;
  setting_enable_explore_video_clickthrough: boolean;
  setting_format_replace_jpeg_with_jpg: boolean;
  setting_format_use_indexing: boolean;
  setting_enable_datetime_format: boolean;
  setting_format_filename: string;
  setting_format_datetime: string;
}

function toReferenceShape(s: Settings): StorageSettings {
  return {
    setting_show_open_in_new_tab_icon: s.showOpenInNewTabIcon,
    setting_show_zip_download_icon: s.showZipDownloadIcon,
    setting_enable_threads: s.enableThreadsSupport,
    setting_enable_video_controls: s.enableVideoControls,
    setting_enable_explore_video_clickthrough: s.enableExploreVideoClickthrough,
    setting_format_replace_jpeg_with_jpg: s.replaceJpegWithJpg,
    setting_format_use_indexing: s.useCarouselIndexing,
    setting_enable_datetime_format: s.enableDatetimeFormat,
    setting_format_filename: s.filenameTemplate,
    setting_format_datetime: s.datetimeFormat,
  };
}

/**
 * In-content-script cache backed by `SettingsService`. Exposes `.settings`
 * synchronously after `init()` completes and re-syncs whenever storage
 * changes (from any context).
 */
class StorageCache {
  public settings: StorageSettings;
  public canonical: Settings;
  public service: SettingsService | null = null;
  public reelsEdgesData: Map<string, unknown> = new Map();
  public storiesReelsMedia: Map<string, unknown> = new Map();
  public storiesUserIds: Map<string, string> = new Map();
  private initialized = false;

  constructor() {
    // Placeholder until init() resolves — SettingsService is NOT instantiated
    // here because that would trigger `chrome.storage.local` access at module
    // load, which breaks non-extension environments (tests, options preview).
    this.canonical = {
      schemaVersion: 1,
      theme: "system",
      defaultDownloadDirectory: "instagram",
      baseDirectory: "instagram",
      prefix: "instagram",
      alwaysPromptSaveAs: false,
      filenameTemplate: "{username}-{id}-{datetime}",
      datetimeFormat: "YYYYMMDD_HHmmss",
      enableDatetimeFormat: true,
      replaceJpegWithJpg: true,
      useCarouselIndexing: true,
      showOpenInNewTabIcon: true,
      showZipDownloadIcon: true,
      enableThreadsSupport: true,
      enableVideoControls: true,
      enableExploreVideoClickthrough: false,
      profileDirectories: [],
      neverAskProfiles: [],
    };
    this.settings = toReferenceShape(this.canonical);
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.service = createSettingsService();

    const [settings, raw] = await Promise.all([
      this.service.get(),
      chrome.storage.local.get(["reels_edges_data", "stories_reels_media", "stories_user_ids"]),
    ]);
    this.canonical = settings;
    this.settings = toReferenceShape(this.canonical);

    const r = raw as {
      reels_edges_data?: Array<[string, unknown]>;
      stories_reels_media?: Array<[string, unknown]>;
      stories_user_ids?: Array<[string, string]>;
    };
    if (r.reels_edges_data) this.reelsEdgesData = new Map(r.reels_edges_data);
    if (r.stories_reels_media) this.storiesReelsMedia = new Map(r.stories_reels_media);
    if (r.stories_user_ids) this.storiesUserIds = new Map(r.stories_user_ids);

    this.service.subscribe((next) => {
      this.canonical = next;
      this.settings = toReferenceShape(next);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.reels_edges_data?.newValue !== undefined)
        this.reelsEdgesData = new Map(changes.reels_edges_data.newValue as Array<[string, unknown]>);
      if (changes.stories_reels_media?.newValue !== undefined)
        this.storiesReelsMedia = new Map(changes.stories_reels_media.newValue as Array<[string, unknown]>);
      if (changes.stories_user_ids?.newValue !== undefined)
        this.storiesUserIds = new Map(changes.stories_user_ids.newValue as Array<[string, string]>);
    });

    this.initialized = true;
  }
}

export const storageCache = new StorageCache();

export function initStorageCache(): Promise<void> {
  return storageCache.init();
}
