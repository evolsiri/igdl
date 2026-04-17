import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import type { NeverAskEntry } from "../../../../types/settings";
import { NeverAskCard } from "../NeverAskCard";

const SAMPLE_ENTRIES: NeverAskEntry[] = [
  { username: "alice", addedAt: Date.UTC(2026, 0, 12) },
  { username: "bob", addedAt: Date.UTC(2026, 1, 4) },
  { username: "threads_only_user", addedAt: Date.UTC(2026, 2, 30) },
];

const meta: Meta<typeof NeverAskCard> = {
  title: "Options/Cards/NeverAskCard",
  component: NeverAskCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { onRemove: fn() },
  render: (args) => {
    const [entries, setEntries] = useState(args.entries);
    return (
      <div class="max-w-3xl mx-auto">
        <NeverAskCard
          entries={entries}
          onRemove={async (username) => {
            setEntries(entries.filter((e) => e.username !== username));
            await args.onRemove(username);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof NeverAskCard>;

export const Empty: Story = { args: { entries: [] } };

export const WithEntries: Story = { args: { entries: SAMPLE_ENTRIES } };

export const RemovesRow: Story = {
  args: { entries: SAMPLE_ENTRIES },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByTestId("never-ask-row-alice");
    const deleteBtn = within(row).getByRole("button", { name: /remove alice/i });
    await userEvent.click(deleteBtn);

    const rootCanvas = within(canvasElement.ownerDocument.body);
    const confirm = await rootCanvas.findByRole("button", { name: /^remove$/i });
    await userEvent.click(confirm);
    await expect(args.onRemove).toHaveBeenCalledWith("alice");
  },
};

export const LightMode: Story = {
  args: { entries: SAMPLE_ENTRIES },
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  args: { entries: SAMPLE_ENTRIES },
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
