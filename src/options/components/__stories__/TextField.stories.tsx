import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { TextField } from "../TextField";

const meta: Meta<typeof TextField> = {
  title: "Options/Shared/TextField",
  component: TextField,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onChange: fn(), onBlur: fn(), label: "Default download directory" },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div class="w-[480px] max-w-full bg-surface border border-border px-6 py-5">
        <TextField
          {...args}
          value={value}
          onChange={(v) => {
            setValue(v);
            args.onChange(v);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof TextField>;

export const Default: Story = {
  args: {
    value: "instagram",
    placeholder: "instagram",
  },
};

export const WithDescription: Story = {
  args: {
    value: "instagram",
    description:
      "Where downloads land when no per-profile directory is set. Relative to the browser's Downloads folder.",
  },
};

export const WithResetValue: Story = {
  args: {
    value: "custom-path",
    description: "Click the reset button on the right to revert to default.",
    resetValue: "instagram",
  },
};

export const URLField: Story = {
  args: {
    label: "Homepage",
    value: "https://instagram.com",
    type: "url",
  },
};

export const TypesAndResets: Story = {
  args: {
    value: "edited",
    resetValue: "instagram",
    description: "Interaction test: type, then reset.",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // getByRole("textbox") avoids matching the ResetButton's
    // aria-label="Reset Default download directory to default", which
    // getByLabelText would also pick up.
    const input = canvas.getByRole("textbox", { name: /default download directory/i }) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "threads" } });
    await expect((args.onChange as ReturnType<typeof fn>).mock.calls.at(-1)?.[0]).toBe("threads");

    const resetBtn = canvas.getByRole("button", { name: /reset .* to default/i });
    await userEvent.click(resetBtn);
    await expect(args.onChange).toHaveBeenLastCalledWith("instagram");
  },
};

export const LightMode: Story = {
  args: { value: "instagram", resetValue: "instagram", description: "Default directory." },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  args: { value: "instagram", resetValue: "instagram", description: "Default directory." },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
