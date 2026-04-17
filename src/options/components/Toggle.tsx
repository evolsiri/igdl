import { useId } from "preact/hooks";
import { ResetButton } from "./ResetButton";

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  id?: string;
  /** When defined, a per-row reset button is rendered that restores this value. */
  resetValue?: boolean;
  testId?: string;
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
  id,
  resetValue,
  testId,
}: ToggleProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  return (
    <div class="flex items-start gap-3 py-3 border-t border-border first:border-t-0">
      <div class="flex items-start gap-3 flex-1 min-w-0">
        <span class="relative inline-block w-10 h-6 shrink-0 mt-0.5">
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
            aria-describedby={descriptionId}
            data-testid={testId}
            class="peer sr-only"
          />
          <span class="absolute inset-0 bg-border transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
          <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-bg shadow-sm transition-transform duration-200 ease-out peer-checked:translate-x-4" />
        </span>
        <div class="flex-1 min-w-0">
          <label
            for={inputId}
            class="block text-sm font-medium text-fg cursor-pointer"
          >
            {label}
          </label>
          {description && (
            <p id={descriptionId} class="text-xs text-muted mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      {resetValue !== undefined && (
        <ResetButton
          onClick={() => onChange(resetValue)}
          title={`Reset ${label} to default`}
        />
      )}
    </div>
  );
}
