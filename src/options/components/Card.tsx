import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

export interface CardProps {
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  /** Optional slot rendered in the card header's right edge (e.g., the Add button on ProfileDirectoriesCard). */
  action?: ComponentChildren;
  children?: ComponentChildren;
  /** Overrides the element id used to link label ↔ region (for screen readers). */
  id?: string;
  testId?: string;
  /** Set to true to show the Show/Hide collapse toggle. Defaults to false. */
  collapsible?: boolean;
}

export function Card({ title, subtitle, action, children, id, testId, collapsible = false }: CardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const titleId = id ? `${id}-title` : undefined;
  const bodyId = id ? `${id}-body` : undefined;

  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      class="bg-surface border border-border px-6 py-5 mb-5"
    >
      {(title || action) && (
        <header class="flex items-center justify-between gap-4 mb-1">
          {title && (
            <h2 id={titleId} class="text-lg font-semibold text-fg">
              {title}
            </h2>
          )}
          <div class="flex items-center gap-2 shrink-0">
            {action && <div class="shrink-0">{action}</div>}
            {title && collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-expanded={!collapsed}
                aria-controls={bodyId}
                class="text-xs font-medium text-muted hover:text-fg border border-border px-2 py-1 transition-colors duration-150"
              >
                {collapsed ? "Show" : "Hide"}
              </button>
            )}
          </div>
        </header>
      )}
      <div
        id={bodyId}
        class="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div class="overflow-hidden min-h-0">
          {subtitle && <p class="text-sm text-muted mb-4">{subtitle}</p>}
          <div>{children}</div>
        </div>
      </div>
    </section>
  );
}
