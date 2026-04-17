import type { MediaCacheService } from "../../services/media-cache/media-cache";
import type { SettingsService } from "../../services/settings/settings";

/**
 * Dependencies handed to every background handler. Tests inject stubs;
 * production wires up real services.
 */
export interface BackgroundDeps {
  settings: SettingsService;
  mediaCache: MediaCacheService;
}
