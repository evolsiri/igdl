import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { ResetButton } from "./ResetButton";

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  description?: ComponentChildren;
  id?: string;
  /** When defined, a per-row reset button is rendered that restores this value. */
  resetValue?: string;
  /**
   * Called when the reset button is clicked, instead of `onChange(resetValue)`.
   * Use this when the parent buffers the field in local state and needs to
   * commit the reset value immediately rather than waiting for blur.
   */
  onReset?: () => void;
  /** Forwarded autocomplete attribute. Defaults to "off" for privacy. */
  autoComplete?: string;
  /** Ref-like data-testid used by tests to target the input. */
  testId?: string;
  type?: "text" | "search" | "url";
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  description,
  id,
  resetValue,
  onReset,
  autoComplete = "off",
  testId,
  type = "text",
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  return (
    <div class="py-3 border-t border-border first:border-t-0">
      <label for={inputId} class="block text-sm font-medium text-fg mb-1">
        {label}
      </label>
      {description && (
        <p id={descriptionId} class="text-xs text-muted mb-2">
          {description}
        </p>
      )}
      <div class="flex items-center gap-3">
        <input
          id={inputId}
          type={type}
          value={value}
          onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-describedby={descriptionId}
          data-testid={testId}
          class="flex-1 min-w-0 bg-bg border border-border text-fg placeholder:text-muted px-3 py-2 outline-none focus:border-accent transition-[border-color,background-color] duration-200"
        />
        {resetValue !== undefined && (
          <ResetButton
            onClick={onReset ?? (() => onChange(resetValue))}
            title={`Reset to default: ${resetValue}`}
          />
        )}
      </div>
    </div>
  );
}
