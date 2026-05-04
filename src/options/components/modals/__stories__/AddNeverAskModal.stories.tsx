import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import { AddNeverAskModal } from "../AddNeverAskModal";

const meta: Meta<typeof AddNeverAskModal> = {
  title: "Options/Modals/AddNeverAskModal",
  component: AddNeverAskModal,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `A modal form for adding a profile to the Never-Ask list. Single username input plus Cancel / Add buttons; validates non-empty username and surfaces an inline error.

**Uses:** Reach for AddNeverAskModal when the user wants a profile's downloads to skip the directory prompt and go straight to the browser's Save As dialog. For adding a profile *with* a custom directory, use \`AddProfileModal\` instead.

**Used in:** The Never-Ask card's "Add" button on the options page (src/options/components/cards/NeverAskCard.tsx).`,
      },
    },
  },
  args: {
    onSubmit: fn(),
    onCancel: fn(),
  },
  render: (args) => {
    const [open, setOpen] = useState(args.open);
    return (
      <div class="min-h-[420px] flex items-center justify-center p-8 bg-bg">
        <button
          type="button"
          class="px-4 py-2 bg-accent text-accent-contrast"
          onClick={() => setOpen(true)}
        >
          Open modal
        </button>
        <AddNeverAskModal
          {...args}
          open={open}
          onCancel={() => {
            args.onCancel();
            setOpen(false);
          }}
          onSubmit={async (username) => {
            await args.onSubmit(username);
            setOpen(false);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof AddNeverAskModal>;

export const Open: Story = { args: { open: true } };

export const Closed: Story = { args: { open: false } };

export const ShowsValidationError: Story = {
  args: { open: true },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement.ownerDocument.body);
    const submit = await root.findByRole("button", { name: /^add$/i });
    await userEvent.click(submit);
    const alert = await root.findByRole("alert");
    await expect(alert).toHaveTextContent(/username is required/i);
  },
};

export const CancelsOnClick: Story = {
  args: { open: true },
  play: async ({ canvasElement, args }) => {
    const root = within(canvasElement.ownerDocument.body);
    const cancel = await root.findByRole("button", { name: /cancel/i });
    await userEvent.click(cancel);
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

export const LightMode: Story = {
  args: { open: true },
  parameters: { forceTheme: "light" },
  globals: { backgrounds: { value: "light" } },
};

export const DarkMode: Story = {
  args: { open: true },
  parameters: { forceTheme: "dark" },
  globals: { backgrounds: { value: "dark" } },
};
