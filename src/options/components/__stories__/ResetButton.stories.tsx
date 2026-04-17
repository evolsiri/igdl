import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ResetButton } from "../ResetButton";

const meta: Meta<typeof ResetButton> = {
  title: "Options/Shared/ResetButton",
  component: ResetButton,
  tags: ["autodocs"],
  args: { onClick: fn(), title: "Reset value to default" },
  argTypes: {
    variant: { control: { type: "inline-radio" }, options: ["reset", "delete"] },
    disabled: { control: "boolean" },
  },
};
export default meta;
type Story = StoryObj<typeof ResetButton>;

export const Reset: Story = {
  args: { variant: "reset" },
};

export const Delete: Story = {
  args: { variant: "delete", title: "Delete entry" },
};

export const Disabled: Story = {
  args: { variant: "reset", disabled: true },
};

export const Clicks: Story = {
  args: { variant: "reset" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: /reset value to default/i });
    await userEvent.click(btn);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const LightMode: Story = {
  args: { variant: "reset" },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  args: { variant: "reset" },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
