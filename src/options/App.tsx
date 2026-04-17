import { useEffect, useState } from "preact/hooks";
import type { MediaCacheService } from "../services/media-cache/media-cache";
import type {
  AddProfileInput,
  SettingsService,
  UpdateProfileInput,
} from "../services/settings/settings";
import { SETTINGS_DEFAULTS } from "../services/settings/schema";
import type { ThemeService } from "../services/theme/theme";
import type { ProfileDirectoriesSort, Settings, ThemeSetting } from "../types/settings";
import { AppearanceCard } from "./components/cards/AppearanceCard";
import { DownloadsCard } from "./components/cards/DownloadsCard";
import { HowItWorksCard } from "./components/cards/HowItWorksCard";
import { NeverAskCard } from "./components/cards/NeverAskCard";
import { ProfileDirectoriesCard } from "./components/cards/ProfileDirectoriesCard";
import { ResetAllCard } from "./components/cards/ResetAllCard";

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
  const handleRemoveNeverAsk = (username: string) => settingsService.removeNeverAsk(username);
  const handleReset = async () => {
    await settingsService.resetAll();
    await mediaCacheService.clearAll();
  };

  return (
    <main class="min-h-screen bg-bg text-fg">
      <div class="max-w-5xl mx-auto px-6 py-10">
        <header class="mb-8">
          <h1 class="text-3xl font-bold text-fg tracking-tight">igdl settings</h1>
          <p class="text-sm text-muted mt-2 max-w-prose">
            Where Instagram and Threads downloads go, and how the on-page UI behaves.
          </p>
        </header>

        <AppearanceCard theme={settings.theme} onChange={handleThemeChange} />

        <DownloadsCard settings={settings} onPatch={handlePatch} />

        <ProfileDirectoriesCard
          profiles={settings.profileDirectories}
          baseDirectory={settings.baseDirectory || SETTINGS_DEFAULTS.baseDirectory}
          sort={settings.profileDirectoriesSort}
          onAdd={handleAddProfile}
          onUpdate={handleUpdateProfile}
          onDelete={handleDeleteProfile}
          onSortChange={handleSortProfiles}
        />

        <NeverAskCard
          entries={settings.neverAskProfiles}
          onRemove={handleRemoveNeverAsk}
        />

        <HowItWorksCard />

        <ResetAllCard onReset={handleReset} />
      </div>
    </main>
  );
}
