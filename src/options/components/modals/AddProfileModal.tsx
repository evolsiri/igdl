import { useEffect, useId, useRef, useState } from "preact/hooks";

export interface AddProfileModalProps {
  open: boolean;
  /** Pre-populates the directory input; typically `defaultDownloadDirectory + "/"`. */
  initialDirectory: string;
  onSubmit: (input: { username: string; directory: string }) => Promise<void> | void;
  onCancel: () => void;
}

export function AddProfileModal({
  open,
  initialDirectory,
  onSubmit,
  onCancel,
}: AddProfileModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const usernameId = useId();
  const directoryId = useId();
  const errorId = useId();

  const [username, setUsername] = useState("");
  const [directory, setDirectory] = useState(initialDirectory);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setUsername("");
      setDirectory(initialDirectory);
      setError(null);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
      requestAnimationFrame(() => usernameRef.current?.focus());
    } else if (!open && dlg.open) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
    }
  }, [open, initialDirectory]);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setError("Username is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ username: trimmedUser, directory });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-profile-title"
      onClose={onCancel}
      class="bg-surface border border-border text-fg p-6 min-w-[420px] max-w-[560px] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={handleSubmit} novalidate>
        <h2 id="add-profile-title" class="text-lg font-semibold mb-1">
          Add profile directory
        </h2>
        <p class="text-sm text-muted mb-4">
          Give a directory for one Instagram profile. Downloads from that profile will land here automatically.
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
            placeholder="alice"
            class="w-full bg-bg border border-border text-fg px-3 py-2 outline-none focus:border-accent transition-[border-color] duration-200"
          />
        </div>

        <div class="py-2">
          <label for={directoryId} class="block text-sm font-medium text-fg mb-1">
            Download directory
          </label>
          <input
            id={directoryId}
            type="text"
            value={directory}
            onInput={(e) => setDirectory((e.currentTarget as HTMLInputElement).value)}
            autoComplete="off"
            placeholder="instagram/alice"
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
