import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import { AddProfileModal } from "../AddProfileModal";

const meta: Meta<typeof AddProfileModal> = {
  title: "Options/Modals/AddProfileModal",
  component: AddProfileModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    initialDirectory: "instagram/",
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
        <AddProfileModal
          {...args}
          open={open}
          onCancel={() => {
            args.onCancel();
            setOpen(false);
          }}
          onSubmit={async (input) => {
            await args.onSubmit(input);
            setOpen(false);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof AddProfileModal>;

export const Open: Story = { args: { open: true } };

export const Closed: Story = { args: { open: false } };

/**
 * Open-state visual snapshot. The full submit flow (type username → click
 * Add → onSubmit fires with the right payload) is covered in the jsdom
 * project at `tests/components/AddProfileModal.test.tsx`. Reproducing it via
 * play function in the browser runner is unstable: Preact's controlled
 * `<input>` inside a native `<dialog>` opened with `showModal()` doesn't
 * reliably commit setUsername from externally-dispatched `input` events or
 * from userEvent.type (the rAF-scheduled auto-focus fights the test's focus).
 */
export const SubmitsForm: Story = {
  args: {
    open: true,
  },
};

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

export const LightMode: Story = {
  args: { open: true },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  args: { open: true },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
