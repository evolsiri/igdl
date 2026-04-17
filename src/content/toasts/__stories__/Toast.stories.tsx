import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, waitFor } from "storybook/test";
import { Toast, ToastStack } from "../Toast";

/**
 * Toast renders inside a Shadow DOM in production (content-script UI, see
 * CLAUDE.md). Inline styles use dark tokens from src/content/tokens.ts and
 * are theme-independent — light/dark variants only change the simulated
 * Instagram surface behind the toast.
 */
const meta: Meta<typeof Toast> = {
  title: "Content/Toasts/Toast",
  component: Toast,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Auto-dismissing toast. Mounted inside a Shadow DOM with inline styles — always dark regardless of surrounding theme.",
      },
    },
  },
  args: { onDismiss: fn(), durationMs: 4000 },
  render: (args) => (
    <div class="min-h-[320px] bg-bg relative">
      <Toast {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: { kind: "success", message: "Downloaded 4 items to instagram/alice" },
};

export const Failure: Story = {
  args: { kind: "failure", message: "Failed to download: network error" },
};

export const Info: Story = {
  args: { kind: "info", message: "Download canceled" },
};

export const LongMessage: Story = {
  args: {
    kind: "failure",
    message:
      "Failed to download carousel item 5 of 10 because the underlying network request timed out after three retries.",
  },
};

export const AutoDismisses: Story = {
  args: { kind: "success", message: "Fast-dismiss test", durationMs: 300 },
  play: async ({ args }) => {
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalled(), { timeout: 2000 });
  },
};

export const LightSurroundings: Story = {
  args: { kind: "success", message: "Light surroundings, dark toast" },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkSurroundings: Story = {
  args: { kind: "success", message: "Dark surroundings, dark toast" },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};

/**
 * Story subtree for ToastStack — lives alongside Toast because the two share
 * a file and the `__stories__/` convention sits next to the file, not the
 * symbol.
 */
export const Stack: StoryObj<typeof ToastStack> = {
  render: () => (
    <div class="min-h-[420px] bg-bg relative">
      <ToastStack
        toasts={[
          { id: "1", kind: "success", message: "Downloaded @alice post 1" },
          { id: "2", kind: "success", message: "Downloaded @alice post 2" },
          { id: "3", kind: "failure", message: "Failed to download @bob reel" },
        ]}
        onDismiss={fn()}
      />
    </div>
  ),
  parameters: { docs: { description: { story: "Three stacked toasts — newer toasts appear at the bottom." } } },
};
