import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useState } from "preact/hooks";
import { expect, fn, userEvent, within } from "storybook/test";
import type { AddProfileInput, UpdateProfileInput } from "../../../../services/settings/settings";
import type { ProfileDirEntry, ProfileDirectoriesSort } from "../../../../types/settings";
import { PROFILE_DIRECTORIES_DEFAULT_SORT } from "../../../../types/settings";
import { ProfileDirectoriesCard } from "../ProfileDirectoriesCard";

const SAMPLE_PROFILES: ProfileDirEntry[] = [
  {
    username: "alice",
    directory: "instagram/alice",
    downloadCount: 42,
    lastDownloadAt: Date.UTC(2026, 3, 10),
    addedAt: Date.UTC(2025, 11, 1),
    lastEditedAt: Date.UTC(2026, 0, 20),
  },
  {
    username: "bob",
    directory: "instagram/bob-photos",
    downloadCount: 7,
    lastDownloadAt: Date.UTC(2026, 2, 18),
    addedAt: Date.UTC(2026, 0, 14),
    lastEditedAt: Date.UTC(2026, 0, 14),
  },
  {
    username: "charlie",
    directory: "",
    downloadCount: 0,
    lastDownloadAt: null,
    addedAt: Date.UTC(2026, 3, 1),
    lastEditedAt: Date.UTC(2026, 3, 1),
  },
];

const meta: Meta<typeof ProfileDirectoriesCard> = {
  title: "Options/Cards/ProfileDirectoriesCard",
  component: ProfileDirectoriesCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    defaultDirectory: "instagram",
    prefix: "",
    neverAskProfiles: [],
    sort: { ...PROFILE_DIRECTORIES_DEFAULT_SORT },
    onAdd: fn(),
    onUpdate: fn(),
    onDelete: fn(),
    onSortChange: fn(),
    onRemoveNeverAsk: fn(),
  },
  render: (args) => {
    const [profiles, setProfiles] = useState<ProfileDirEntry[]>(args.profiles);
    const [sort, setSort] = useState<ProfileDirectoriesSort>(args.sort);
    return (
      <div class="max-w-5xl mx-auto">
        <ProfileDirectoriesCard
          profiles={profiles}
          defaultDirectory={args.defaultDirectory}
          prefix={args.prefix}
          neverAskProfiles={args.neverAskProfiles}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            args.onSortChange(next);
          }}
          onRemoveNeverAsk={args.onRemoveNeverAsk}
          onAdd={async (input: AddProfileInput) => {
            const next: ProfileDirEntry = {
              username: input.username,
              directory: input.directory,
              downloadCount: 0,
              lastDownloadAt: null,
              addedAt: Date.now(),
              lastEditedAt: Date.now(),
            };
            setProfiles([...profiles, next]);
            await args.onAdd(input);
            return next;
          }}
          onUpdate={async (username: string, fields: UpdateProfileInput) => {
            const updated = profiles.find((p) => p.username === username);
            if (!updated) throw new Error("not found");
            const merged = { ...updated, ...fields, lastEditedAt: Date.now() };
            setProfiles(
              profiles.map((p) => (p.username === username ? merged : p)),
            );
            await args.onUpdate(username, fields);
            return merged;
          }}
          onDelete={async (username: string) => {
            setProfiles(profiles.filter((p) => p.username !== username));
            await args.onDelete(username);
          }}
        />
      </div>
    );
  },
};
export default meta;
type Story = StoryObj<typeof ProfileDirectoriesCard>;

export const Empty: Story = { args: { profiles: [] } };

export const Populated: Story = { args: { profiles: SAMPLE_PROFILES } };

export const EditsUsernameInline: Story = {
  args: { profiles: SAMPLE_PROFILES },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cell = canvas.getByTestId("row-alice-username-cell");
    await userEvent.click(within(cell).getByRole("button", { name: /alice/i }));

    const input = canvas.getByTestId("row-alice-username-input") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "alice2");
    input.blur();
    await expect(args.onUpdate).toHaveBeenCalledWith("alice", { username: "alice2" });
  },
};

export const DeletesRow: Story = {
  args: { profiles: SAMPLE_PROFILES },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const deleteBtn = canvas.getByRole("button", { name: /delete bob/i });
    await userEvent.click(deleteBtn);

    const root = within(canvasElement.ownerDocument.body);
    const confirm = await root.findByRole("button", { name: /^delete$/i });
    await userEvent.click(confirm);
    await expect(args.onDelete).toHaveBeenCalledWith("bob");
  },
};

export const LightMode: Story = {
  args: { profiles: SAMPLE_PROFILES },

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
  args: { profiles: SAMPLE_PROFILES },

  parameters: {
    forceTheme: "dark"
  },

  globals: {
    backgrounds: {
      value: "dark"
    }
  }
};

export const FilterByUsername: Story = {
  args: { profiles: SAMPLE_PROFILES },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: /search profile directories/i });
    await userEvent.type(search, "alice");
    await expect(canvas.getByTestId("row-alice-username-cell")).toBeInTheDocument();
    await expect(canvas.queryByTestId("row-bob-username-cell")).not.toBeInTheDocument();
    await expect(canvas.queryByTestId("row-charlie-username-cell")).not.toBeInTheDocument();
  },
};

export const FilterByDirectory: Story = {
  args: { profiles: SAMPLE_PROFILES },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox", { name: /search profile directories/i });
    await userEvent.type(search, "bob-photos");
    await expect(canvas.getByTestId("row-bob-username-cell")).toBeInTheDocument();
    await expect(canvas.queryByTestId("row-alice-username-cell")).not.toBeInTheDocument();
    await expect(canvas.queryByTestId("row-charlie-username-cell")).not.toBeInTheDocument();
  },
};

export const SortedByUsernameAsc: Story = {
  args: {
    profiles: SAMPLE_PROFILES,
    sort: { key: "username", direction: "asc" },
  },
};

export const SortedByUsernameDesc: Story = {
  args: {
    profiles: SAMPLE_PROFILES,
    sort: { key: "username", direction: "desc" },
  },
};

export const SortedByAddedOnAsc: Story = {
  args: {
    profiles: SAMPLE_PROFILES,
    sort: { key: "addedAt", direction: "asc" },
  },
};

export const SortedByAddedOnDesc: Story = {
  args: {
    profiles: SAMPLE_PROFILES,
    sort: { key: "addedAt", direction: "desc" },
  },
};

