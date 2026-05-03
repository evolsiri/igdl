import { useId } from "preact/hooks";
import type { ThemeSetting } from "../../../types/settings";
import { Card } from "../Card";

export interface AppearanceCardProps {
  theme: ThemeSetting;
  onChange: (theme: ThemeSetting) => void;
}

const OPTIONS: Array<{ value: ThemeSetting; label: string; icon: () => preact.JSX.Element }> = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light",  label: "Light",  icon: SunIcon },
  { value: "dark",   label: "Dark",   icon: MoonIcon },
];

export function AppearanceCard({ theme, onChange }: AppearanceCardProps) {
  const groupName = useId();

  const buttons = (
    <div role="radiogroup" aria-label="Theme" class="inline-flex">
      {OPTIONS.map((opt, i) => {
        const checked = theme === opt.value;
        return (
          <label
            key={opt.value}
            class={[
              "relative w-28 cursor-pointer select-none",
              "border border-border transition-colors duration-150",
              i > 0 ? "-ml-px" : "",
              checked
                ? "bg-accent text-accent-contrast border-accent z-10"
                : "bg-surface text-fg hover:bg-surface-hover",
            ].join(" ")}
          >
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              class="peer sr-only"
            />
            <span class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2">
              <opt.icon />
              {opt.label}
            </span>
          </label>
        );
      })}
    </div>
  );

  return (
    <Card
      title="Appearance"
      action={buttons}
      id="appearance"
      testId="appearance-card"
    />
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
