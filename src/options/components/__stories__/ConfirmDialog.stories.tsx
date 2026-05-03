import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConfirmDialog } from "../ConfirmDialog";

const meta: Meta<typeof ConfirmDialog> = {
  title: "Options/Shared/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onConfirm: fn(),
    onCancel: fn(),
    title: "Delete alice?",
    message: "This removes the per-profile directory. This cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  },
  render: (args) => {
    const [open, setOpen] = useState(args.open);
    return (
      <div class="min-h-[360px] flex items-center justify-center p-8 bg-bg">
        <button
          type="button"
          class="px-4 py-2 border border-border text-fg hover:bg-surface-hover transition-colors duration-150"
          onClick={() => setOpen(true)}
        >
          Open dialog
        </button>
        <ConfirmDialog
          {...args}
          open={open}
          onConfirm={() => {
            args.onConfirm();
            setOpen(false);
          }}
          onCancel={() => {
            args.onCancel();
            setOpen(false);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Info: Story = { args: { open: true, destructive: false, title: "Remove alice from the never-ask list?" } };

export const Destructive: Story = {
  args: {
    open: true,
    destructive: true,
    title: "Reset all settings?",
    message: "Every setting returns to its default. This cannot be undone.",
    confirmLabel: "Reset everything",
  },
};

export const Closed: Story = { args: { open: false } };

export const ConfirmsOnClick: Story = {
  args: { open: true, destructive: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const confirm = await canvas.findByRole("button", { name: /delete/i });
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};

export const CancelsOnClick: Story = {
  args: { open: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const cancel = await canvas.findByRole("button", { name: /cancel/i });
    await userEvent.click(cancel);
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

export const LightMode: Story = {
  args: { open: true, destructive: false },

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
  args: { open: true, destructive: true },

  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};
