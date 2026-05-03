import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ResetAllCard } from "../ResetAllCard";

const meta: Meta<typeof ResetAllCard> = {
  title: "Options/Cards/ResetAllCard",
  component: ResetAllCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onReset: fn() },
  render: (args) => (
    <div class="max-w-3xl mx-auto">
      <ResetAllCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof ResetAllCard>;

export const Default: Story = {};

export const ResetsAll: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const openBtn = canvas.getByRole("button", { name: /reset all settings/i });
    await userEvent.click(openBtn);

    const root = within(canvasElement.ownerDocument.body);
    const confirm = await root.findByRole("button", { name: /reset everything/i });
    await userEvent.click(confirm);
    await expect(args.onReset).toHaveBeenCalledTimes(1);
  },
};

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
