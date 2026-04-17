import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { NoDirPopup } from "../NoDirPopup";

/**
 * NoDirPopup mounts inside a Shadow DOM in production (content-script UI,
 * per CLAUDE.md architecture invariants) and styles itself with inline styles
 * + dark-only tokens from src/content/tokens.ts. The component's appearance
 * does NOT change between light and dark story variants — the only difference
 * is the surrounding canvas background, which simulates dark Instagram vs.
 * Instagram's light theme.
 */
const meta: Meta<typeof NoDirPopup> = {
  title: "Content/Modals/NoDirPopup",
  component: NoDirPopup,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "On-page popup rendered when the user clicks download on a profile that has no configured directory. Always dark — mounted inside a Shadow DOM with inline styles.",
      },
    },
  },
  args: {
    username: "alice",
    initialDirectory: "instagram/",
    defaultDirectory: "instagram",
    onChoice: fn(),
    onCancel: fn(),
  },
  render: (args) => (
    <div class="min-h-[520px] bg-bg">
      <NoDirPopup {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof NoDirPopup>;

export const Default: Story = {};

export const EmptyDefaultDirectory: Story = {
  args: { defaultDirectory: "" },
};

export const LongUsername: Story = {
  args: { username: "a_very_long_instagram_handle_2026" },
};

export const ChoosesDefaultDirectory: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: /download to/i });
    await userEvent.click(btn);
    await expect(args.onChoice).toHaveBeenCalledWith({ kind: "default" });
  },
};

export const ChoosesNeverAsk: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: /never ask for @alice/i });
    await userEvent.click(btn);
    await expect(args.onChoice).toHaveBeenCalledWith({ kind: "neverAsk" });
  },
};

export const SetsDirectoryFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const setBtn = canvas.getByRole("button", { name: /set directory for @alice/i });
    await userEvent.click(setBtn);

    const input = (await canvas.findByRole("textbox")) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "instagram/alice" } });

    const save = canvas.getByRole("button", { name: /save .* download/i });
    await userEvent.click(save);
    await expect(args.onChoice).toHaveBeenCalledWith({
      kind: "setDirectory",
      directory: "instagram/alice",
    });
  },
};

export const TooltipVisible: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Hovering the info glyph inside the 'Download to' ghost button reveals the tooltip to its right.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId("info-tooltip-default");
    await userEvent.hover(trigger);
    // The wrapper is aria-hidden (so the tooltip text doesn't pollute the parent
    // button's accessible name); `hidden: true` queries the DOM directly.
    const tooltip = within(trigger).getByRole("tooltip", { hidden: true });
    await expect(tooltip.textContent ?? "").toMatch(/default directory/i);
  },
};

export const EnterKeySubmits: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /set directory for @alice/i }));

    const input = (await canvas.findByRole("textbox")) as HTMLInputElement;
    // The input auto-focuses + auto-selects via rAF; userEvent.clear + type races
    // that in browser mode and can drop leading characters. Set the value
    // deterministically, then fire Enter to exercise the form submit path.
    fireEvent.input(input, { target: { value: "instagram/alice" } });
    await userEvent.type(input, "{Enter}");

    await expect(args.onChoice).toHaveBeenCalledWith({
      kind: "setDirectory",
      directory: "instagram/alice",
    });
  },
};

export const LightSurroundings: Story = {
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkSurroundings: Story = {
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
