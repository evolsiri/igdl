import type { Meta, StoryObj } from "@storybook/preact-vite";
import { fn } from "storybook/test";
import { SETTINGS_DEFAULTS } from "../../../../services/settings/schema";
import { ImportExportCard } from "../ImportExportCard";

const meta: Meta<typeof ImportExportCard> = {
  title: "Options/Cards/ImportExportCard",
  component: ImportExportCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onExport: async () => SETTINGS_DEFAULTS,
    onImport: fn(),
  },
  render: (args) => (
    <div class="max-w-3xl mx-auto">
      <ImportExportCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof ImportExportCard>;

export const Default: Story = {};

export const LightMode: Story = {
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
  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};
