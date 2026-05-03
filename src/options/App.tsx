import { useEffect, useState } from "preact/hooks";
import type { MediaCacheService } from "../services/media-cache/media-cache";
import type {
  AddProfileInput,
  SettingsService,
  UpdateProfileInput,
} from "../services/settings/settings";
import type { ThemeService } from "../services/theme/theme";
import type { ProfileDirectoriesSort, Settings, ThemeSetting } from "../types/settings";
import { AppearanceCard } from "./components/cards/AppearanceCard";
import { DownloadsCard } from "./components/cards/DownloadsCard";
import { ImportExportCard } from "./components/cards/ImportExportCard";
import { NeverAskCard } from "./components/cards/NeverAskCard";
import { ProfileDirectoriesCard } from "./components/cards/ProfileDirectoriesCard";

export interface AppProps {
  settingsService: SettingsService;
  mediaCacheService: MediaCacheService;
  themeService: ThemeService;
}

export function App({ settingsService, mediaCacheService, themeService }: AppProps) {
  const [settings, setSettings] = useState<Settings | null>(null);

  // Initial load + subscribe for cross-context sync.
  useEffect(() => {
    let mounted = true;
    settingsService.get().then((loaded) => {
      if (mounted) setSettings(loaded);
    });
    const off = settingsService.subscribe((next) => {
      if (mounted) setSettings(next);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [settingsService]);

  // Apply theme whenever the setting changes.
  useEffect(() => {
    if (!settings) return;
    themeService.apply(settings.theme);
  }, [settings?.theme, themeService]);

  if (!settings) {
    return (
      <main class="min-h-screen bg-bg text-fg flex items-center justify-center">
        <p class="text-muted">Loading settings…</p>
      </main>
    );
  }

  const handlePatch = (partial: Partial<Settings>) => settingsService.patch(partial);
  const handleThemeChange = (theme: ThemeSetting) => settingsService.patch({ theme });
  const handleAddProfile = (input: AddProfileInput) => settingsService.addProfile(input);
  const handleUpdateProfile = (username: string, fields: UpdateProfileInput) =>
    settingsService.updateProfile(username, fields);
  const handleDeleteProfile = (username: string) => settingsService.deleteProfile(username);
  const handleSortProfiles = (sort: ProfileDirectoriesSort) =>
    settingsService.setProfileDirectoriesSort(sort);
  const handleAddNeverAsk = (username: string) => settingsService.addNeverAsk(username);
  const handleRemoveNeverAsk = (username: string) => settingsService.removeNeverAsk(username);
  const handleReset = async () => {
    await settingsService.resetAll();
    await mediaCacheService.clearAll();
  };
  const handleExport = () => settingsService.get();
  const handleImport = (parsed: Record<string, unknown>) =>
    // SettingsService.set re-normalizes via the schema, so missing fields fall
    // back to defaults and invalid types are coerced — the cast is safe.
    settingsService.set(parsed as unknown as Settings);

  return (
    <main class="min-h-screen bg-bg text-fg">
      <div class="max-w-5xl mx-auto px-6 py-10">
        <header class="flex items-center justify-between gap-4 mb-8">
          <div class="flex items-center gap-3">
            <img src="/logo.svg" width="40" height="40" alt="igdl" />
            <h1 class="text-3xl font-bold text-fg tracking-tight">Settings</h1>
          </div>
          <a
            href="https://github.com/evolsiri/igdl"
            target="_blank"
            rel="noreferrer noopener"
            class="flex items-center gap-1.5 text-sm text-muted hover:text-fg transition-colors duration-150 shrink-0"
          >
            <GitHubIcon />
            GitHub
          </a>
        </header>

        <DownloadsCard settings={settings} onPatch={handlePatch} />

        <ProfileDirectoriesCard
          profiles={settings.profileDirectories}
          defaultDirectory={settings.defaultDownloadDirectory}
          prefix={settings.prefix}
          neverAskProfiles={settings.neverAskProfiles}
          sort={settings.profileDirectoriesSort}
          onAdd={handleAddProfile}
          onUpdate={handleUpdateProfile}
          onDelete={handleDeleteProfile}
          onSortChange={handleSortProfiles}
          onRemoveNeverAsk={handleRemoveNeverAsk}
        />

        <NeverAskCard
          entries={settings.neverAskProfiles}
          profileDirectoryUsernames={settings.profileDirectories.map((p) => p.username)}
          onAdd={handleAddNeverAsk}
          onRemove={handleRemoveNeverAsk}
          onRemoveFromDirectories={handleDeleteProfile}
        />

        <AppearanceCard theme={settings.theme} onChange={handleThemeChange} />

        <ImportExportCard onExport={handleExport} onImport={handleImport} onReset={handleReset} />
      </div>
    </main>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}
