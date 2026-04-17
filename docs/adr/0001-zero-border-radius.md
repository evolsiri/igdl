# 0001 — Zero border-radius across all extension UI

- Status: accepted
- Date: 2026-02-01

## Context

The project's visual spec demands sharp, rectilinear surfaces — no rounded corners anywhere in the options page or in injected modals/toasts. Enforcing this on a per-component basis (remembering to pass `rounded-none` or `border-radius: 0` every time) is fragile: Tailwind defaults several utilities (like `rounded-lg`) to non-zero values, and browsers have UA defaults (buttons, inputs, dialogs) that apply rounded corners even without any author CSS.

Any missed corner is a visible visual-spec regression. The cost of auditing every PR for stray rounded corners is high.

## Decision

We set `border-radius: 0` globally via a CSS reset that matches `*, ::before, ::after` in both `src/index.css` (options page) and the inline style tokens used by Shadow-DOM injected UI. Tailwind's `@theme` block also zeroes out every default radius token.

New components **do not** need to opt into this — it's the default. Dialogs, buttons, inputs, cards, toasts: all zero.

## Consequences

- **Visual consistency is automatic.** No one can accidentally ship a rounded corner.
- **Third-party components can't be dropped in unmodified.** Any library with intrinsic rounded styling (e.g., certain date pickers) has to be overridden or avoided.
- **Reviewers** (`ux-reviewer` agent, human reviewers) check new components against this rule; a global reset means the check is "are any corners visibly rounded?" rather than "did you remember to pass `rounded-none`?".
- **Storybook's Design System story** enforces this visually by showing radius tokens as zero — any new token that isn't zero is a red flag.
