import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AddProfileInput, UpdateProfileInput } from "../../../services/SettingsService";
import type { ProfileDirEntry } from "../../../types/settings";
import { filterByQuery } from "../../../utils/search";
import { Card } from "../Card";
import { ConfirmDialog } from "../ConfirmDialog";
import { ResetButton } from "../ResetButton";
import { SearchInput } from "../SearchInput";
import { AddProfileModal } from "../modals/AddProfileModal";
import { formatRelativeDate, formatShortDate } from "./_format";

export interface ProfileDirectoriesCardProps {
  profiles: ProfileDirEntry[];
  baseDirectory: string;
  onAdd: (input: AddProfileInput) => Promise<ProfileDirEntry>;
  onUpdate: (username: string, fields: UpdateProfileInput) => Promise<ProfileDirEntry>;
  onDelete: (username: string) => Promise<void>;
}

type EditField = "username" | "directory";
interface EditingState {
  username: string;
  field: EditField;
  draft: string;
}

export function ProfileDirectoriesCard({
  profiles,
  baseDirectory,
  onAdd,
  onUpdate,
  onDelete,
}: ProfileDirectoriesCardProps) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterByQuery(profiles, query, (p) => `${p.username} ${p.directory}`),
    [profiles, query],
  );

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  function beginEdit(row: ProfileDirEntry, field: EditField): void {
    setEditing({ username: row.username, field, draft: row[field] });
  }

  async function commitEdit(): Promise<void> {
    if (!editing) return;
    const original = profiles.find((p) => p.username === editing.username);
    if (!original || original[editing.field] === editing.draft) {
      setEditing(null);
      return;
    }
    const fields: UpdateProfileInput =
      editing.field === "username"
        ? { username: editing.draft }
        : { directory: editing.draft };
    try {
      await onUpdate(editing.username, fields);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEditing(null);
    }
  }

  function cancelEdit(): void {
    setEditing(null);
  }

  async function handleAdd(input: AddProfileInput): Promise<void> {
    await onAdd(input);
    setShowAdd(false);
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) return;
    try {
      await onDelete(confirmDelete);
    } finally {
      setConfirmDelete(null);
    }
  }

  const addButton = (
    <button
      type="button"
      onClick={() => setShowAdd(true)}
      class="px-3 py-1.5 bg-accent text-accent-contrast text-sm font-medium hover:bg-accent-hover transition-[background-color,transform] duration-150 hover:scale-[1.02] active:scale-[0.98]"
    >
      + Add profile
    </button>
  );

  return (
    <Card
      title="Profile Download Directories"
      subtitle="Per-profile destination folders. Click a cell to edit — Enter saves, Esc reverts."
      action={addButton}
      id="profile-directories"
      testId="profile-directories-card"
    >
      {profiles.length > 0 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by username or directory…"
          ariaLabel="Search profile directories"
        />
      )}

      {error && (
        <div
          role="alert"
          class="mb-3 px-3 py-2 border border-destructive text-destructive text-sm"
        >
          {error}
        </div>
      )}

      {profiles.length === 0 ? (
        <p class="text-sm text-muted py-4">
          No profile directories yet. Click{" "}
          <span class="font-medium text-fg">+ Add profile</span> to route a specific Instagram profile to its own folder.
        </p>
      ) : filtered.length === 0 ? (
        <p class="text-sm text-muted py-4">
          No profiles match <span class="font-medium text-fg">{query}</span>.
        </p>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-sm border-collapse" data-testid="profile-directories-table">
            <thead>
              <tr class="text-left text-xs font-medium text-muted uppercase tracking-wide border-b border-border">
                <th class="py-2 pr-3 w-[4%]" aria-label="Instagram" />
                <th class="py-2 px-3 w-[20%]">Username</th>
                <th class="py-2 px-3 w-[38%]">Directory</th>
                <th
                  class="py-2 px-3 text-right w-[6%]"
                  aria-label="Download count"
                  title="Download count"
                >
                  #
                </th>
                <th class="py-2 px-3 w-[12%]">Last download</th>
                <th class="py-2 px-3 w-[12%]">Added on</th>
                <th class="py-2 pl-3 w-[8%]" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <ProfileRow
                  key={row.username}
                  row={row}
                  editing={editing && editing.username === row.username ? editing : null}
                  onBeginEdit={(field) => beginEdit(row, field)}
                  onDraftChange={(draft) =>
                    editing && setEditing({ ...editing, draft })
                  }
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  onRequestDelete={() => setConfirmDelete(row.username)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddProfileModal
        open={showAdd}
        initialDirectory={`${baseDirectory}/`}
        onSubmit={handleAdd}
        onCancel={() => setShowAdd(false)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete ?? ""}?`}
        message="Removes the per-profile directory. Future downloads from this profile will use the default directory instead."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </Card>
  );
}

interface ProfileRowProps {
  row: ProfileDirEntry;
  editing: EditingState | null;
  onBeginEdit: (field: EditField) => void;
  onDraftChange: (draft: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRequestDelete: () => void;
}

function ProfileRow({
  row,
  editing,
  onBeginEdit,
  onDraftChange,
  onCommit,
  onCancel,
  onRequestDelete,
}: ProfileRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing?.field, editing?.username]);

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const isEditingUsername = editing?.field === "username";
  const isEditingDirectory = editing?.field === "directory";

  return (
    <tr class="border-b border-border hover:bg-surface-hover/60 transition-colors duration-100">
      <td class="py-3 pr-3 align-middle">
        <a
          href={`https://www.instagram.com/${encodeURIComponent(row.username)}/`}
          target="_blank"
          rel="noreferrer noopener"
          class="inline-flex items-center justify-center w-8 h-8 text-muted hover:text-accent transition-colors duration-150"
          aria-label={`Open @${row.username} on Instagram`}
          title={`Open @${row.username} on Instagram`}
          data-testid={`row-${row.username}-instagram-link`}
        >
          <InstagramGlyph />
        </a>
      </td>
      <td class="py-3 px-3 align-middle" data-testid={`row-${row.username}-username-cell`}>
        {isEditingUsername ? (
          <input
            ref={inputRef}
            type="text"
            value={editing!.draft}
            onInput={(e) => onDraftChange((e.currentTarget as HTMLInputElement).value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            class="w-full bg-bg border border-accent px-2 py-1 text-sm text-fg outline-none"
            data-testid={`row-${row.username}-username-input`}
          />
        ) : (
          <button
            type="button"
            onClick={() => onBeginEdit("username")}
            class="w-full text-left font-medium text-sm text-fg hover:text-accent border border-transparent px-2 py-1 truncate transition-colors duration-150"
          >
            {row.username}
          </button>
        )}
      </td>
      <td class="py-3 px-3 align-middle" data-testid={`row-${row.username}-directory-cell`}>
        {isEditingDirectory ? (
          <input
            ref={inputRef}
            type="text"
            value={editing!.draft}
            onInput={(e) => onDraftChange((e.currentTarget as HTMLInputElement).value)}
            onBlur={onCommit}
            onKeyDown={handleKeyDown}
            class="w-full bg-bg border border-accent px-2 py-1 font-mono text-xs text-fg outline-none"
            data-testid={`row-${row.username}-directory-input`}
          />
        ) : (
          <button
            type="button"
            onClick={() => onBeginEdit("directory")}
            class="w-full text-left text-muted hover:text-accent border border-transparent px-2 py-1 font-mono text-xs truncate transition-colors duration-150"
          >
            {row.directory || <span class="italic">not set</span>}
          </button>
        )}
      </td>
      <td class="py-3 px-3 align-middle text-right text-muted">{row.downloadCount}</td>
      <td
        class="py-3 px-3 align-middle text-xs text-muted whitespace-nowrap overflow-hidden text-ellipsis"
        title={formatShortDate(row.lastDownloadAt)}
      >
        {formatRelativeDate(row.lastDownloadAt)}
      </td>
      <td
        class="py-3 px-3 align-middle text-xs text-muted whitespace-nowrap overflow-hidden text-ellipsis"
        title={formatShortDate(row.addedAt)}
      >
        {formatRelativeDate(row.addedAt)}
      </td>
      <td class="py-3 pl-3 align-middle">
        <ResetButton
          variant="delete"
          onClick={onRequestDelete}
          title={`Delete ${row.username}`}
        />
      </td>
    </tr>
  );
}

function InstagramGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
