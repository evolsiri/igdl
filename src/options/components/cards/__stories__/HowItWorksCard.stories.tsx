import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { HowItWorksCard } from "../HowItWorksCard";

const meta: Meta<typeof HowItWorksCard> = {
  title: "Options/Cards/HowItWorksCard",
  component: HowItWorksCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  render: () => (
    <div class="max-w-3xl mx-auto">
      <HowItWorksCard />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof HowItWorksCard>;

export const Collapsed: Story = {};

export const ExpandsOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const summary = canvas.getAllByText(/what the extension does/i)[0];
    const details = summary.closest("details");
    await expect(details?.hasAttribute("open")).toBe(false);
    await userEvent.click(summary);
    await expect(details?.hasAttribute("open")).toBe(true);
  },
};

export const LightMode: Story = {
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
