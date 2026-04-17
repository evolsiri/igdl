import { createMediaCacheService } from "../services/media-cache/media-cache";
import { createSettingsService } from "../services/settings/settings";
import { registerSharedBackground } from "./shared/register";

/**
 * Chrome MV3 service worker entry. Declared in `chrome.manifest.json` as
 * `background.service_worker`. Keep this file free of module-scope side
 * effects beyond listener registration — the SW can restart at any time.
 */

const deps = {
  settings: createSettingsService(),
  mediaCache: createMediaCacheService(),
};

registerSharedBackground(deps);
