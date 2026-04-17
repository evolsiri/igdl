export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible label for screen readers. Defaults to "Search". */
  ariaLabel?: string;
  /** Element id to associate with an external `<label>` if needed. */
  id?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  id,
  autoFocus,
}: SearchInputProps) {
  return (
    <div class="relative mb-4">
      <input
        id={id}
        type="search"
        value={value}
        onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autofocus={autoFocus}
        class="w-full bg-bg border border-border text-fg placeholder:text-muted px-3 py-2 outline-none focus:border-accent transition-[border-color,background-color,transform] duration-200 ease-out"
      />
    </div>
  );
}
