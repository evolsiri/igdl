import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
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

export const CustomizeAndReset: Story = {
  name: "Customize and Reset",
  args: { settings: { ...SETTINGS_DEFAULTS } },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    await step("Change default download directory", async () => {
      const input = canvas.getByRole("textbox", { name: /default download directory/i });
      await userEvent.click(input);
      fireEvent.input(input, { target: { value: "photos" } });
      await userEvent.tab();
      await sleep(150);
    });

    await step("Change prefix", async () => {
      const input = canvas.getByRole("textbox", { name: /prefix/i });
      await userEvent.click(input);
      fireEvent.input(input, { target: { value: "ig" } });
      await userEvent.tab();
      await sleep(150);
    });

    await step("Enable always prompt Save As", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /always prompt save as/i }));
      await sleep(150);
    });

    await step("Change filename template", async () => {
      const input = canvas.getByRole("textbox", { name: /filename template/i });
      await userEvent.click(input);
      fireEvent.input(input, { target: { value: "{id}-{username}" } });
      await sleep(150);
    });

    await step("Change datetime format", async () => {
      const input = canvas.getByRole("textbox", { name: /datetime format/i });
      await userEvent.click(input);
      fireEvent.input(input, { target: { value: "YYYY-MM-DD" } });
      await sleep(150);
    });

    await step("Disable include datetime in filenames", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /include datetime in filenames/i }));
      await sleep(150);
    });

    await step("Disable replace .jpeg with .jpg", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /replace \.jpeg with \.jpg/i }));
      await sleep(150);
    });

    await step("Disable index carousel items", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /index carousel items/i }));
      await sleep(150);
    });

    await step('Disable show "open in new tab" icon', async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /open in new tab/i }));
      await sleep(150);
    });

    await step('Disable show "ZIP download" icon', async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /zip download/i }));
      await sleep(150);
    });

    await step("Disable Threads.com support", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /threads\.com support/i }));
      await sleep(150);
    });

    await step("Disable enhanced video controls", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /enhanced video controls/i }));
      await sleep(150);
    });

    await step("Enable explore video clickthrough", async () => {
      await userEvent.click(canvas.getByRole("checkbox", { name: /explore video clickthrough/i }));
      await sleep(300);
    });

    await step("Reset all fields top to bottom", async () => {
      const resetBtns = canvas.getAllByRole("button", { name: /^reset to default:/i });
      for (const btn of resetBtns) {
        await userEvent.click(btn);
        await sleep(100);
      }
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          "Changes every setting away from its default, then resets each field from top to bottom.",
      },
    },
  },
};

export const LightMode: Story = {
  args: { settings: { ...SETTINGS_DEFAULTS } },

  parameters: {
    forceTheme: "light"
  },

  globals: {
    backgrounds: {
      value: "light"
    }
  }
};

export const DarkMode: Story = {
  args: { settings: { ...SETTINGS_DEFAULTS } },

  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};
