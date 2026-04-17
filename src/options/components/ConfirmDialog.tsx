import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ComponentChildren;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button with the destructive palette (dark red). */
  destructive?: boolean;
  onConfirm: () => void;
  /** Called when the user cancels via the Cancel button, the Esc key, or dialog close. */
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Guard against jsdom environments that haven't polyfilled showModal.
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    } else if (!open && dlg.open) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
    }
  }, [open]);

  const confirmClasses = destructive
    ? "bg-destructive text-destructive-contrast hover:bg-destructive-hover"
    : "bg-accent text-accent-contrast hover:bg-accent-hover";

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      onClose={onCancel}
      class="bg-surface border border-border text-fg p-6 min-w-[360px] max-w-[480px] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <h2 id="confirm-dialog-title" class="text-lg font-semibold mb-2">
        {title}
      </h2>
      {message && <div class="text-sm text-muted mb-4">{message}</div>}
      <div class="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          class="px-4 py-2 border border-border text-fg hover:bg-surface-hover transition-colors duration-150"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          class={`px-4 py-2 ${confirmClasses} transition-colors duration-150 hover:scale-[1.02] active:scale-[0.98]`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
