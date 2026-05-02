import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import { SETTINGS_DEFAULTS } from "../../../../services/settings/schema";
import type { Settings } from "../../../../types/settings";
import { DownloadsCard } from "../DownloadsCard";

const meta: Meta<typeof DownloadsCard> = {
  title: "Options/Cards/DownloadsCard",
  component: DownloadsCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onPatch: fn() },
  render: (args) => {
    const [settings, setSettings] = useState<Settings>(args.settings);
    return (
      <div class="max-w-3xl mx-auto">
        <DownloadsCard
          settings={settings}
          onPatch={(partial) => {
            setSettings({ ...settings, ...partial });
            args.onPatch(partial);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof DownloadsCard>;

export const Defaults: Story = { args: { settings: { ...SETTINGS_DEFAULTS } } };

export const CustomizedSettings: Story = {
  args: {
    settings: {
      ...SETTINGS_DEFAULTS,
      defaultDownloadDirectory: "instagram/downloads",
      prefix: "ig",
      alwaysPromptSaveAs: true,
      filenameTemplate: "{id}-{username}",
      enableDatetimeFormat: false,
      replaceJpegWithJpg: false,
      useCarouselIndexing: false,
      showOpenInNewTabIcon: false,
      showZipDownloadIcon: false,
      enableThreadsSupport: false,
      enableVideoControls: false,
      enableExploreVideoClickthrough: true,
    },
  },
};

export const FilterReducesRows: Story = {
  args: { settings: { ...SETTINGS_DEFAULTS } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: /search downloads settings/i });
    await userEvent.type(search, "datetime");
    const list = canvas.getByTestId("downloads-list");
    await expect(list).toHaveTextContent(/datetime/i);
    await expect(list).not.toHaveTextContent(/Replace \.jpeg/i);
  },
};

export const TogglesAlwaysPromptSaveAs: Story = {
  args: { settings: { ...SETTINGS_DEFAULTS } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const label = canvas.getByText(/always prompt save as/i);
    await userEvent.click(label);
    await expect(args.onPatch).toHaveBeenCalledWith({ alwaysPromptSaveAs: true });
  },
};

export const LightMode: Story = {
  args: { settings: { ...SETTINGS_DEFAULTS } },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  args: { settings: { ...SETTINGS_DEFAULTS } },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
