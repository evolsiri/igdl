import type { Meta, StoryObj } from "@storybook/preact-vite";
import { Card } from "../Card";

const meta: Meta<typeof Card> = {
  title: "Options/Shared/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  argTypes: {
    title: { control: "text" },
    subtitle: { control: "text" },
    action: { control: false },
    children: { control: false },
  },
  render: (args) => (
    <Card {...args}>
      <p class="text-sm text-fg">
        Card body content. Any Preact children render below the header.
      </p>
    </Card>
  ),
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    title: "Appearance",
    subtitle: "Theme for the igdl settings page and injected UI.",
  },
};

export const WithAction: Story = {
  args: {
    title: "Profile Download Directories",
    subtitle: "Per-profile destination directories.",
  },
  render: (args) => (
    <Card
      {...args}
      action={
        <button
          type="button"
          class="px-3 py-1.5 bg-accent text-accent-contrast text-sm font-medium hover:bg-accent-hover transition-colors duration-150"
        >
          + Add profile
        </button>
      }
    >
      <p class="text-sm text-fg">
        Card body content. Any Preact children render below the header.
      </p>
    </Card>
  ),
};

export const NoTitle: Story = {
  args: {},
  render: () => (
    <Card>
      <p class="text-sm text-muted">
        A card without a title — just a framed surface for arbitrary content.
      </p>
    </Card>
  ),
};

export const LightMode: Story = {
  args: Default.args,

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
  args: Default.args,

  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};
