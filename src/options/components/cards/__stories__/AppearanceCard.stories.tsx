import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import type { ThemeSetting } from "../../../../types/settings";
import { AppearanceCard } from "../AppearanceCard";

const meta: Meta<typeof AppearanceCard> = {
  title: "Options/Cards/AppearanceCard",
  component: AppearanceCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onChange: fn() },
  render: (args) => {
    const [theme, setTheme] = useState<ThemeSetting>(args.theme);
    return (
      <div class="max-w-3xl mx-auto">
        <AppearanceCard
          theme={theme}
          onChange={(t) => {
            setTheme(t);
            args.onChange(t);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof AppearanceCard>;

export const SystemSelected: Story = { args: { theme: "system" } };
export const LightSelected: Story = { args: { theme: "light" } };
export const DarkSelected: Story = { args: { theme: "dark" } };

export const SelectsDark: Story = {
  args: { theme: "system" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // The <input type="radio"> is `sr-only` (Tailwind) which positions it at
    // 1x1px — Testing Library's role resolver treats it as inaccessible.
    // Click the visible label text instead; the <label> forwards the click
    // to the wrapped input. `getByText("Dark")` exact-matches the leading
    // span, avoiding the description text on the Light option.
    const darkLabel = canvas.getByText("Dark");
    await userEvent.click(darkLabel);
    await expect(args.onChange).toHaveBeenCalledWith("dark");
  },
};

export const LightMode: Story = {
  args: { theme: "light" },

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
  args: { theme: "dark" },

  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};
