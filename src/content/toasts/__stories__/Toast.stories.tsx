import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Toast, ToastStack, type ToastKind } from "../Toast";

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
    <div class="min-h-[320px] bg-bg">
      <div style={{ position: "fixed", bottom: "24px", right: "24px", width: "360px" }}>
        <Toast {...args} />
      </div>
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
  render: (args) => (
    <div style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div style={{ position: "fixed", bottom: "24px", right: "24px", width: "360px" }}>
        <Toast {...args} />
      </div>
    </div>
  ),
};

export const DarkSurroundings: Story = {
  args: { kind: "success", message: "Dark surroundings, dark toast" },
  render: (args) => (
    <div style={{ minHeight: "100vh", background: "#121212" }}>
      <div style={{ position: "fixed", bottom: "24px", right: "24px", width: "360px" }}>
        <Toast {...args} />
      </div>
    </div>
  ),
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

// Module-level trigger — lets the play function add toasts imperatively
// without needing DOM queries or hidden buttons.
const addToastRef: { current: ((kind: ToastKind, message: string) => void) | null } = {
  current: null,
};

export const AnimatesStack: StoryObj<typeof ToastStack> = {
  name: "Stack — Animated",
  render: () => {
    const [toasts, setToasts] = useState<Array<{ id: string; kind: ToastKind; message: string }>>(
      [],
    );
    addToastRef.current = (kind, message) =>
      setToasts((prev) => [...prev, { id: `s${Date.now()}`, kind, message }]);
    return (
      <div class="min-h-[600px] bg-bg">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </div>
    );
  },
  play: async ({ step }) => {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    await sleep(300);

    await step("First toast appears", async () => {
      addToastRef.current?.("success", "Downloaded @alice — carousel 1 of 3");
      await sleep(700);
    });
    await step("Second toast bumps first up", async () => {
      addToastRef.current?.("info", "Download canceled");
      await sleep(700);
    });
    await step("Third toast bumps stack up", async () => {
      addToastRef.current?.("failure", "Network error — post 3 of 5");
      await sleep(700);
    });
    await step("Fourth toast completes the stack", async () => {
      addToastRef.current?.("success", "Downloaded @bob — reel");
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          "Adds four toasts in sequence with 700 ms gaps — watch the FLIP spring-bump as each new toast pushes the stack upward.",
      },
    },
  },
};

const KINDS_CYCLE: ToastKind[] = ["success", "info", "success", "failure", "success"];

export const AnimatesManyStack: StoryObj<typeof ToastStack> = {
  name: "Stack — Animated Many",
  render: () => {
    const [toasts, setToasts] = useState<Array<{ id: string; kind: ToastKind; message: string }>>(
      [],
    );
    addToastRef.current = (kind, message) =>
      setToasts((prev) => [...prev, { id: `m${Date.now()}`, kind, message }]);
    return (
      <div class="min-h-screen bg-bg">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </div>
    );
  },
  play: async () => {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    await sleep(300);
    for (let i = 0; i < 50; i++) {
      const kind = KINDS_CYCLE[i % KINDS_CYCLE.length];
      const n = i + 1;
      const message =
        kind === "failure"
          ? `Network error — item ${n}`
          : kind === "info"
          ? `Download canceled — item ${n}`
          : `Downloaded @user${n} — post ${n}`;
      addToastRef.current?.(kind, message);
      await sleep(80);
    }
  },
  parameters: {
    docs: {
      description: {
        story: "Rapidly adds 50 toasts to stress-test the spring-bump stack and progress-bar dismiss.",
      },
    },
  },
};

export const AnimatesDismissMany: StoryObj<typeof ToastStack> = {
  name: "Stack — Animated Dismiss Many",
  render: () => {
    const [toasts, setToasts] = useState<Array<{ id: string; kind: ToastKind; message: string }>>(
      [],
    );
    addToastRef.current = (kind, message) =>
      setToasts((prev) => [...prev, { id: `d${Date.now()}`, kind, message }]);
    return (
      <div class="min-h-[600px] bg-bg">
        <ToastStack
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </div>
    );
  },
  play: async ({ canvasElement, step }) => {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const canvas = within(canvasElement);
    const btns = () => canvas.getAllByRole("button", { name: /dismiss notification/i });

    await step("Add 5 toasts", async () => {
      await sleep(300);
      addToastRef.current?.("success", "Downloaded @alice — post 1");
      await sleep(350);
      addToastRef.current?.("info", "Download canceled");
      await sleep(350);
      addToastRef.current?.("success", "Downloaded @bob — reel");
      await sleep(350);
      addToastRef.current?.("failure", "Network error — post 4");
      await sleep(350);
      addToastRef.current?.("success", "Downloaded @carol — post 5");
      await sleep(500);
    });

    await step("Close 2nd toast", async () => {
      await userEvent.click(btns()[1]);
      await sleep(600);
    });
    await step("Close 4th toast", async () => {
      // Stack is [1,3,4,5] — 4th original is index 2
      await userEvent.click(btns()[2]);
      await sleep(600);
    });
    await step("Close 3rd toast", async () => {
      // Stack is [1,3,5] — 3rd original is index 1
      await userEvent.click(btns()[1]);
      await sleep(600);
    });
    await step("Close 1st toast", async () => {
      // Stack is [1,5] — 1st original is index 0
      await userEvent.click(btns()[0]);
      await sleep(600);
    });
    await step("Close 5th toast", async () => {
      // Stack is [5] — only one left
      await userEvent.click(btns()[0]);
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          "Adds 5 toasts then closes them out-of-order (2nd, 4th, 3rd, 1st, 5th) to demonstrate stack reflow on each dismiss.",
      },
    },
  },
};
