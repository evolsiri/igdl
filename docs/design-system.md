# Design System

This document is an **index**. The source of truth is the `Design System/*` story group at `src/stories/DesignSystem.stories.tsx` — open Storybook (`pnpm run storybook`) to see every token rendered live. When you add or change a token, update the story in the same PR; this doc only sketches the categories.

## The three stories

| Story | Covers | Backed by |
| --- | --- | --- |
| `Design System / Color Palette` | Every colour token in both themes. Swatches read live values via `getComputedStyle`, so the Storybook theme toolbar flips them in real time. | `src/index.css`, `src/content/tokens.ts` |
| `Design System / Design Tokens` | Non-colour primitives: radii (all `0`), motion durations and easings (with an interactive demo), typography ramp, and spacing. | `src/index.css`, `src/content/tokens.ts` |
| `Design System / Components` | Hand-maintained inventory of every Preact component, grouped by directory, with a pointer to each component's own Storybook story. | `src/options/components/**`, `src/content/**` |

## Token surfaces

Two surfaces, two source files:

- **Options page** — Tailwind v4's `@theme` block in `src/index.css`. Variables shadow themselves under `:root.dark`. `ThemeService` flips the `dark` class on `<html>`; no re-render needed.
- **Injected UI** — inline-token object in `src/content/tokens.ts`. Shadow-DOM-rendered components style themselves from this — Tailwind utilities don't reach inside the shadow root, and no stylesheet is injected there. Injected UI is dark-only because it sits on top of Instagram's own themed surfaces.

## Hard rules

- **Zero border-radius** on every UI element. SVG `rx` and SVG primitives like `<circle>` are the only opt-out (used for brand glyphs and the round logo). Every `border-radius` rule resolves to `0`.
- **Dark-first.** OS preference defaults the theme; the user can force light or dark on the options page. Injected UI is always dark.
- **CSS transitions only.** Use `--duration-hover` / `--duration-focus` + `--ease-out-swift`. No JS animation libraries.
- **Brand alignment.** `--color-brand-green` (`#a8f368`) is the accent / success / focus ring and pairs with black for ~15.7:1 (AAA). `--color-brand-pink` (`#f9035e`) is the destructive / error fill and pairs with white. Both stay constant across themes — they're identity, not surface.

## Adding a token, colour, or component

1. **New colour** → add the variable to `src/index.css` (`@theme` and `:root.dark` blocks) **and** a row in `OPTIONS_COLOR_GROUPS` in the design-system story.
2. **New content-script colour** → extend the `TOKENS` object in `src/content/tokens.ts` **and** `CONTENT_TOKEN_DESCRIPTIONS` in the story.
3. **New component** → ship a `__stories__/<Name>.stories.tsx` with `LightMode` + `DarkMode` variants and add a row to `COMPONENT_GROUPS` in the design-system story.
4. **New motion / radius / spacing** → update `src/index.css` and the matching `RADII` / `TYPE_SCALE` / `SPACING` array in the story.

All four of the project-local reviewer agents (`code-reviewer`, `ux-reviewer`, `documentation-reviewer`, `extension-auditor`) check this contract on review.
