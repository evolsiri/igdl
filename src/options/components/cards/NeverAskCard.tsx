import { useEffect, useMemo, useState } from "preact/hooks";
import type { NeverAskEntry } from "../../../types/settings";
import { filterByQuery } from "../../../utils/search";
import { Card } from "../Card";
import { ConfirmDialog } from "../ConfirmDialog";
import { ResetButton } from "../ResetButton";
import { SearchInput } from "../SearchInput";
import { AddNeverAskModal } from "../modals/AddNeverAskModal";
import { formatRelativeDate, formatShortDate } from "./_format";

export interface NeverAskCardProps {
  entries: NeverAskEntry[];
  /** Usernames that have a configured profile directory — used for conflict detection. */
  profileDirectoryUsernames: string[];
  onAdd: (username: string) => Promise<void> | void;
  onRemove: (username: string) => Promise<void> | void;
  /** Called when conflict is confirmed — removes the profile directory entry. */
  onRemoveFromDirectories: (username: string) => Promise<void> | void;
}

export function NeverAskCard({
  entries,
  profileDirectoryUsernames,
  onAdd,
  onRemove,
  onRemoveFromDirectories,
}: NeverAskCardProps) {
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [profileDirConflict, setProfileDirConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (entries.length === 0) return entries;
    const matches = filterByQuery(entries, query, (e) => e.username);
    return matches.length === 0 ? entries : matches;
  }, [entries, query]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(t);
  }, [error]);

  async function handleAdd(username: string): Promise<void> {
    const normalized = username.trim().toLowerCase();
    if (entries.some((e) => e.username === normalized)) {
      throw new Error(`@${normalized} is already on the Never-Ask list.`);
    }
    if (profileDirectoryUsernames.includes(normalized)) {
      setShowAdd(false);
      setProfileDirConflict(normalized);
      return;
    }
    await onAdd(normalized);
    setShowAdd(false);
  }

  async function handleConfirmProfileDirConflict(): Promise<void> {
    if (!profileDirConflict) return;
    const username = profileDirConflict;
    setProfileDirConflict(null);
    try {
      await onAdd(username);
      await onRemoveFromDirectories(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleConfirmRemove() {
    if (!confirmTarget) return;
    await onRemove(confirmTarget);
    setConfirmTarget(null);
  }

  const addButton = (
    <button
      type="button"
      onClick={() => setShowAdd(true)}
      class="px-3 py-1.5 bg-accent text-accent-contrast text-sm font-medium hover:bg-accent-hover transition-colors duration-150"
    >
      + Add profile
    </button>
  );

  return (
    <Card
      title="Never-Ask Profiles"
      subtitle="Downloads from these profiles skip the directory prompt and go straight to your browser's Save As dialog. Remove a profile to bring the prompt back."
      action={addButton}
      id="never-ask"
      testId="never-ask-card"
      collapsible={true}
    >
      {entries.length > 0 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search never-ask profiles…"
          ariaLabel="Search never-ask profiles"
        />
      )}

      {error && (
        <div role="alert" class="mb-3 px-3 py-2 border border-destructive text-destructive text-sm">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <div class="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <InfoIcon />
          <span>
            No profiles opted out yet. When you click{" "}
            <span class="font-medium text-fg">Never ask for this profile</span> in the download popup, it lands here.
          </span>
        </div>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full table-fixed text-sm border-collapse" data-testid="never-ask-table">
            <thead>
              <tr class="text-left text-xs font-medium text-muted uppercase tracking-wide border-b border-border">
                <th class="py-2 pr-3 w-[4%]" aria-label="Instagram" />
                <th class="py-2 px-3 w-[61%]">Username</th>
                <th class="py-2 px-3 w-[27%]">Added on</th>
                <th class="py-2 pl-3 w-[8%]" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.username}
                  class="border-b border-border hover:bg-surface-hover/60 transition-colors duration-100"
                  data-testid={`never-ask-row-${entry.username}`}
                >
                  <td class="py-3 pr-3 align-middle">
                    <a
                      href={`https://www.instagram.com/${encodeURIComponent(entry.username)}/`}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="inline-flex items-center justify-center w-8 h-8 text-muted hover:text-accent transition-colors duration-150"
                      aria-label={`Open @${entry.username} on Instagram`}
                      title={`Open @${entry.username} on Instagram`}
                    >
                      <InstagramGlyph />
                    </a>
                  </td>
                  <td class="py-3 px-3 align-middle text-sm font-medium text-fg truncate">
                    {entry.username}
                  </td>
                  <td
                    class="py-3 px-3 align-middle text-xs text-muted whitespace-nowrap overflow-hidden text-ellipsis"
                    title={formatShortDate(entry.addedAt)}
                  >
                    {formatRelativeDate(entry.addedAt)}
                  </td>
                  <td class="py-3 pl-3 align-middle">
                    <ResetButton
                      variant="delete"
                      onClick={() => setConfirmTarget(entry.username)}
                      title={`Remove ${entry.username} from the never-ask list`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddNeverAskModal
        open={showAdd}
        onSubmit={handleAdd}
        onCancel={() => setShowAdd(false)}
      />

      <ConfirmDialog
        open={profileDirConflict !== null}
        title={`Add @${profileDirConflict ?? ""} to Never-Ask?`}
        message={`@${profileDirConflict ?? ""} has a custom download directory configured. A profile can't follow both rules at once — the Never-Ask list routes downloads straight to your browser's Save As dialog, making the directory setting unreachable. Confirming will remove @${profileDirConflict ?? ""} from Profile Download Directories.`}
        confirmLabel="Add to Never-Ask"
        cancelLabel="Cancel"
        onConfirm={handleConfirmProfileDirConflict}
        onCancel={() => setProfileDirConflict(null)}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        title={`Remove ${confirmTarget ?? ""} from the never-ask list?`}
        message="Next time you click the download button on this profile, igdl will ask where to save the media."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmTarget(null)}
      />
    </Card>
  );
}

function InfoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="shrink-0 text-muted"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
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
