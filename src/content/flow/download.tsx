import { render } from "preact";
import type { DownloadService } from "../../services/download/download";
import type { SettingsService } from "../../services/settings/settings";
import type { ToastService } from "../../services/toast/toast";
import type { MediaResource } from "../../types/instagram";
import type { Settings } from "../../types/settings";
import { storageCache } from "../extractors/storage";
import { NoDirPopup, type NoDirAction } from "../modals/NoDirPopup";
import { createShadowMount, type ShadowMount } from "../modals/mount";

export interface DownloadFlowDeps {
  settings: SettingsService;
  download: DownloadService;
  toast: ToastService;
  /** Shadow mount factory — injected for tests. Defaults to the real one. */
  mountFactory?: () => ShadowMount;
  /** Injected settings snapshot for tests — skips storageCache.canonical lookup. */
  settingsSnapshot?: Settings;
}

/**
 * Shared click pipeline for every download button. Runs on every surface
 * (post, reel, story, highlight, etc.) after the surface-specific handler
 * has extracted the `MediaResource[]`.
 *
 * Flow (PAC-2.3 / 2.4 / 2.5 / 2.6 / 2.7):
 *  0. If alwaysPromptSaveAs is enabled → Save As prompt, no routing.
 *  1. Else if the profile has a configured directory → silent download.
 *  2. Else if the profile is on the never-ask list → Save As prompt (browser dialog).
 *  3. Else → show NoDirPopup with three choices.
 *
 * Toasts fire on success/failure (PAC-3.1 / 3.2).
 */
export async function handleDownloadClick(
  resources: MediaResource[],
  deps: DownloadFlowDeps,
): Promise<void> {
  if (resources.length === 0) return;
  const username = resources[0].username;
  const normalized = username.trim().toLowerCase();

  const settings = deps.settingsSnapshot ?? storageCache.canonical;

  if (settings.alwaysPromptSaveAs) {
    await downloadAll(resources, deps, { saveAs: true });
    return;
  }

  const hasCustomDir = settings.profileDirectories.some((p) => p.username === normalized);
  const isNeverAsk = settings.neverAskProfiles.some((e) => e.username === normalized);

  if (hasCustomDir) {
    await downloadAll(resources, deps);
    return;
  }
  if (isNeverAsk) {
    await downloadAll(resources, deps, { saveAs: true });
    return;
  }

  const choice = await promptNoDir(
    {
      username,
      initialDirectory: `${settings.prefix}/`,
      defaultDirectory: settings.defaultDownloadDirectory,
    },
    deps.mountFactory ?? createShadowMount,
  );
  if (!choice) return;

  switch (choice.kind) {
    case "setDirectory":
      try {
        await deps.settings.addProfile({ username, directory: choice.directory });
      } catch (err) {
        deps.toast.failure(err instanceof Error ? err.message : String(err));
        return;
      }
      await downloadAll(resources, deps);
      return;
    case "default":
      await downloadAll(resources, deps);
      return;
    case "neverAsk":
      await deps.settings.addNeverAsk(username);
      await downloadAll(resources, deps, { saveAs: true });
      return;
  }
}


async function downloadAll(
  resources: MediaResource[],
  deps: DownloadFlowDeps,
  options: { saveAs?: boolean } = {},
): Promise<void> {
  let successes = 0;
  let canceled = 0;
  let firstError = "";
  for (const resource of resources) {
    const result = await deps.download.queue(resource, options.saveAs ? { saveAs: true } : undefined);
    if (result.ok) {
      successes += 1;
    } else if (isUserCanceled(result.error)) {
      canceled += 1;
    } else if (!firstError) {
      firstError = result.error;
    }
  }
  const username = resources[0].username;
  if (firstError && successes === 0) {
    deps.toast.failure(`Download failed: ${firstError}`);
    return;
  }
  if (firstError) {
    deps.toast.failure(`Only ${successes}/${resources.length} downloaded — ${firstError}`);
    return;
  }
  if (canceled > 0 && successes === 0) {
    deps.toast.info(canceled === 1 ? "Download canceled" : `${canceled} downloads canceled`);
    return;
  }
  deps.toast.success(
    resources.length === 1
      ? `Downloaded @${username}`
      : `Downloaded ${successes} items from @${username}`,
  );
}

// Chrome surfaces "User canceled" when the Save As dialog is dismissed;
// Firefox uses similar wording. Match both without overreaching.
function isUserCanceled(error: string): boolean {
  return /cancel/i.test(error);
}

interface NoDirArgs {
  username: string;
  initialDirectory: string;
  defaultDirectory: string;
}

async function promptNoDir(
  args: NoDirArgs,
  mountFactory: () => ShadowMount,
): Promise<NoDirAction | null> {
  return new Promise((resolve) => {
    const mount = mountFactory();
    const close = (result: NoDirAction | null) => {
      mount.dispose();
      resolve(result);
    };
    mount.render(
      <NoDirPopup
        username={args.username}
        initialDirectory={args.initialDirectory}
        defaultDirectory={args.defaultDirectory}
        onChoice={(action) => close(action)}
        onCancel={() => close(null)}
      />,
    );
  });
}

// Keep preact `render` reachable so tree-shaking doesn't strip it before we
// construct the dynamic Preact roots above.
void render;
