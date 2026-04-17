import { useMemo, useState } from "preact/hooks";
import type { NeverAskEntry } from "../../../types/settings";
import { filterByQuery } from "../../../utils/search";
import { Card } from "../Card";
import { ConfirmDialog } from "../ConfirmDialog";
import { ResetButton } from "../ResetButton";
import { SearchInput } from "../SearchInput";
import { formatShortDate } from "./_format";

export interface NeverAskCardProps {
  entries: NeverAskEntry[];
  onRemove: (username: string) => Promise<void> | void;
}

export function NeverAskCard({ entries, onRemove }: NeverAskCardProps) {
  const [query, setQuery] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (entries.length === 0) return entries;
    const matches = filterByQuery(entries, query, (e) => e.username);
    return matches.length === 0 ? entries : matches;
  }, [entries, query]);

  async function handleConfirmRemove() {
    if (!confirmTarget) return;
    await onRemove(confirmTarget);
    setConfirmTarget(null);
  }

  return (
    <Card
      title="Never-Ask Profiles"
      subtitle="Profiles that skip the set-directory popup and land in the default directory. Remove an entry here to bring the popup back."
      id="never-ask"
      testId="never-ask-card"
    >
      {entries.length > 0 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search never-ask profiles…"
          ariaLabel="Search never-ask profiles"
        />
      )}

      {entries.length === 0 ? (
        <p class="text-sm text-muted py-4">
          No profiles opted out yet. When you click{" "}
          <span class="font-medium text-fg">Never ask for this profile</span> in the download popup, it lands here.
        </p>
      ) : (
        <ul class="divide-y divide-border">
          {filtered.map((entry) => (
            <li
              key={entry.username}
              class="flex items-center justify-between gap-3 py-3"
              data-testid={`never-ask-row-${entry.username}`}
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-fg truncate">{entry.username}</div>
                <div class="text-xs text-muted">Added {formatShortDate(entry.addedAt)}</div>
              </div>
              <ResetButton
                variant="delete"
                onClick={() => setConfirmTarget(entry.username)}
                title={`Remove ${entry.username} from the never-ask list`}
              />
            </li>
          ))}
        </ul>
      )}

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
