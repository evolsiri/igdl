import { useState } from "preact/hooks";
import { Card } from "../Card";
import { ConfirmDialog } from "../ConfirmDialog";

export interface ResetAllCardProps {
  onReset: () => Promise<void> | void;
}

export function ResetAllCard({ onReset }: ResetAllCardProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <Card
      title="Reset all settings"
      subtitle="Restores every setting to its default and clears the profile and never-ask lists. Cannot be undone."
      id="reset-all"
      testId="reset-all-card"
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        class="px-4 py-2 border border-destructive text-destructive hover:bg-destructive hover:text-destructive-contrast transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
      >
        Reset all settings
      </button>
      <ConfirmDialog
        open={open}
        title="Reset all settings?"
        message={
          <>
            Every setting returns to its default. Profile directories, the never-ask list,
            and cached download counts will be cleared. This cannot be undone.
          </>
        }
        confirmLabel={busy ? "Resetting…" : "Reset everything"}
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}
