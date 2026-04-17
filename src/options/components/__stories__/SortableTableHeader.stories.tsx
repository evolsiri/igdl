import type { Meta, StoryObj } from "@storybook/preact-vite";
import { fn } from "storybook/test";
import { SortableTableHeader } from "../SortableTableHeader";

type Key = "username" | "addedAt";

const meta: Meta<typeof SortableTableHeader<Key>> = {
  title: "Options/Shared/SortableTableHeader",
  component: SortableTableHeader,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A `<th>` wrapper with a stacked up/down arrow pair to the left of the column label. Each arrow is an independent button — up = ascending, down = descending. Clicking the already-active arrow emits `onClear` so the parent can revert to its default sort.",
      },
    },
  },
  args: {
    label: "Username",
    sortKey: "username",
    activeSortKey: null,
    activeDirection: null,
    onSort: fn(),
    onClear: fn(),
  },
  render: (args) => (
    <table class="w-full">
      <thead>
        <tr class="text-left text-xs font-medium text-muted uppercase tracking-wide border-b border-border">
          <SortableTableHeader<Key> {...args} />
        </tr>
      </thead>
    </table>
  ),
};
export default meta;
type Story = StoryObj<typeof SortableTableHeader<Key>>;

export const Inactive: Story = {};

export const AscendingActive: Story = {
  args: { activeSortKey: "username", activeDirection: "asc" },
};

export const DescendingActive: Story = {
  args: { activeSortKey: "username", activeDirection: "desc" },
};

export const RightAligned: Story = {
  args: { label: "#", align: "right", thClass: "text-right" },
};

export const LightMode: Story = {
  parameters: { forceTheme: "light", backgrounds: { default: "light" } },
};

export const DarkMode: Story = {
  parameters: { forceTheme: "dark", backgrounds: { default: "dark" } },
};
