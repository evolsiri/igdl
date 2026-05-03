import { useEffect, useId, useRef, useState } from "preact/hooks";

export interface AddNeverAskModalProps {
  open: boolean;
  onSubmit: (username: string) => Promise<void> | void;
  onCancel: () => void;
}

export function AddNeverAskModal({ open, onSubmit, onCancel }: AddNeverAskModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const usernameId = useId();
  const errorId = useId();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setUsername("");
      setError(null);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
      requestAnimationFrame(() => usernameRef.current?.focus());
    } else if (!open && dlg.open) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
    }
  }, [open]);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Username is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-never-ask-title"
      onClose={onCancel}
      class="bg-surface border border-border text-fg p-6 min-w-[420px] max-w-[560px] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={handleSubmit} novalidate>
        <h2 id="add-never-ask-title" class="text-lg font-semibold mb-1">
          Add to Never-Ask
        </h2>
        <p class="text-sm text-muted mb-4">
          Downloads from this profile will skip the directory prompt and go straight to your browser's Save As dialog.
        </p>

        <div class="py-2">
          <label for={usernameId} class="block text-sm font-medium text-fg mb-1">
            Instagram username
          </label>
          <input
            ref={usernameRef}
            id={usernameId}
            type="text"
            value={username}
            onInput={(e) => setUsername((e.currentTarget as HTMLInputElement).value)}
            autoComplete="off"
            placeholder="alice_delish"
            class="w-full bg-bg border border-border text-fg px-3 py-2 outline-none focus:border-accent transition-[border-color] duration-200"
          />
        </div>

        {error && (
          <p id={errorId} role="alert" class="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div class="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            class="px-4 py-2 border border-border text-fg hover:bg-surface-hover transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            class="px-4 py-2 bg-accent text-accent-contrast hover:bg-accent-hover transition-colors duration-150 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
