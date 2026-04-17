import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import { Toggle } from "../Toggle";

const meta: Meta<typeof Toggle> = {
  title: "Options/Shared/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onChange: fn(), label: "Always prompt Save As" },
  render: (args) => {
    const [checked, setChecked] = useState(args.checked);
    return (
      <div class="w-[480px] max-w-full bg-surface border border-border px-6 py-5">
        <Toggle
          {...args}
          checked={checked}
          onChange={(v) => {
            setChecked(v);
            args.onChange(v);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof Toggle>;

export const Off: Story = { args: { checked: false } };

export const On: Story = { args: { checked: true } };

export const WithDescription: Story = {
  args: {
    checked: false,
    description: "Show the browser's native Save As dialog on every download.",
  },
};

export const WithResetValue: Story = {
  args: {
    checked: true,
    description: "Custom value — click reset to revert to the default.",
    resetValue: false,
  },
};

export const Toggles: Story = {
  args: {
    checked: false,
    description: "Interaction test: click to flip the switch.",
    resetValue: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const label = canvas.getByText(/always prompt save as/i);
    await userEvent.click(label);
    await expect(args.onChange).toHaveBeenCalledWith(true);

    const resetBtn = canvas.getByRole("button", { name: /reset .* to default/i });
    await userEvent.click(resetBtn);
    await expect(args.onChange).toHaveBeenLastCalledWith(false);
  },
};

export const LightMode: Story = {
  args: { checked: true, description: "A green switch on a light surface." },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  args: { checked: true, description: "A green switch on a dark surface." },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
