import type { ComponentChildren } from "preact";

export interface CardProps {
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  /** Optional slot rendered in the card header's right edge (e.g., the Add button on ProfileDirectoriesCard). */
  action?: ComponentChildren;
  children: ComponentChildren;
  /** Overrides the element id used to link label ↔ region (for screen readers). */
  id?: string;
  testId?: string;
}

export function Card({ title, subtitle, action, children, id, testId }: CardProps) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      class="bg-surface border border-border px-6 py-5 mb-5"
    >
      {(title || action) && (
        <header class="flex items-start justify-between gap-4 mb-1">
          {title && (
            <h2 id={titleId} class="text-lg font-semibold text-fg">
              {title}
            </h2>
          )}
          {action && <div class="shrink-0">{action}</div>}
        </header>
      )}
      {subtitle && <p class="text-sm text-muted mb-4">{subtitle}</p>}
      <div>{children}</div>
    </section>
  );
}
