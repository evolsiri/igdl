import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import { SearchInput } from "../SearchInput";

const meta: Meta<typeof SearchInput> = {
  title: "Options/Shared/SearchInput",
  component: SearchInput,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onChange: fn(), placeholder: "Search…" },
  render: (args) => {
    const [value, setValue] = useState(args.value ?? "");
    return (
      <div class="w-96 max-w-full">
        <SearchInput
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
type Story = StoryObj<typeof SearchInput>;

export const Empty: Story = { args: { value: "" } };

export const WithValue: Story = { args: { value: "alice" } };

export const AutoFocus: Story = { args: { value: "", autoFocus: true } };

export const Typing: Story = {
  args: { value: "" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox");
    await userEvent.type(input, "threads");
    await expect(args.onChange).toHaveBeenCalled();
    await expect((args.onChange as ReturnType<typeof fn>).mock.calls.at(-1)?.[0]).toBe("threads");
  },
};

export const LightMode: Story = {
  args: { value: "carousel" },

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
  args: { value: "carousel" },

  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};
