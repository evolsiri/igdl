import type { MediaCacheService } from "../../services/MediaCacheService";
import type { SettingsService } from "../../services/SettingsService";

/**
 * Dependencies handed to every background handler. Tests inject stubs;
 * production wires up real services.
 */
export interface BackgroundDeps {
  settings: SettingsService;
  mediaCache: MediaCacheService;
}
