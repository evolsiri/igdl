import { useId } from "preact/hooks";
import type { ThemeSetting } from "../../../types/settings";
import { Card } from "../Card";

export interface AppearanceCardProps {
  theme: ThemeSetting;
  onChange: (theme: ThemeSetting) => void;
}

const OPTIONS: Array<{ value: ThemeSetting; label: string; description: string }> = [
  { value: "system", label: "System", description: "Follow your OS theme preference." },
  { value: "light", label: "Light", description: "Bright surfaces, dark text." },
  { value: "dark", label: "Dark", description: "Deep dark surfaces." },
];

export function AppearanceCard({ theme, onChange }: AppearanceCardProps) {
  const groupName = useId();
  return (
    <Card
      title="Appearance"
      subtitle="Theme for this page and the overlay on Instagram / Threads."
      id="appearance"
      testId="appearance-card"
    >
      <div role="radiogroup" aria-label="Theme">
        {OPTIONS.map((opt) => {
          const checked = theme === opt.value;
          return (
            <label
              key={opt.value}
              class="flex items-start gap-3 py-3 border-t border-border first:border-t-0 cursor-pointer"
            >
              <input
                type="radio"
                name={groupName}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                class="peer sr-only"
              />
              <span
                aria-hidden="true"
                class="mt-0.5 w-4 h-4 shrink-0 border border-border bg-bg peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2 transition-colors duration-150"
              />
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-medium text-fg">{opt.label}</span>
                <span class="block text-xs text-muted mt-0.5">{opt.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}
