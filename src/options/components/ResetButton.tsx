export type ResetButtonVariant = "reset" | "delete";

export interface ResetButtonProps {
  onClick: () => void;
  /** Shown as both native tooltip and the button's accessible name. */
  title: string;
  variant?: ResetButtonVariant;
  disabled?: boolean;
}

export function ResetButton({
  onClick,
  title,
  variant = "reset",
  disabled,
}: ResetButtonProps) {
  const hoverClasses =
    variant === "delete"
      ? "hover:bg-destructive hover:text-destructive-contrast hover:border-destructive"
      : "hover:bg-accent hover:text-accent-contrast hover:border-accent";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      class={`inline-flex w-8 h-8 shrink-0 items-center justify-center border border-border bg-bg text-muted transition-[transform,background-color,color,border-color] duration-150 ease-out ${hoverClasses} hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none`}
    >
      {variant === "reset" ? <ResetGlyph /> : <DeleteGlyph />}
    </button>
  );
}

function ResetGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function DeleteGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
