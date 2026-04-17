# Design System

This document indexes igdl's visual and interaction language. The **Storybook story at `Design System/*` is the source of truth** — this file is a pointer + the contribution contract.

## Where to look

Run Storybook locally:

```bash
pnpm run storybook
```

The sidebar's `Design System` group has three stories that render live from the production tokens:

| Story | Covers | Backed by |
|---|---|---|
| `Design System / Color Palette` | Every colour token — options-page CSS variables (both themes) and content-script TypeScript tokens. Swatches read live CSS values via `getComputedStyle`, so toggling the Storybook theme toolbar flips them in real time. | `src/index.css`, `src/content/tokens.ts` |
| `Design System / Design Tokens` | Non-colour primitives: radii (all `0`), motion durations (120 ms hover / 160 ms focus with an interactive demo), typography (font stack + used size ramp), and frequently-used spacing. | `src/index.css`, `src/content/tokens.ts` |
| `Design System / Components` | Hand-maintained inventory of every Preact component shipped in the extension, grouped by directory, each pointing to its sibling Storybook story. | `src/options/components/**`, `src/content/**` |

The story file itself lives at `src/stories/DesignSystem.stories.tsx`.

## Source-of-truth contract

1. **Palette and tokens** — The values in `src/index.css` (options-page) and `src/content/tokens.ts` (content-script) are authoritative. The Storybook swatches read them at render time; they don't hardcode hex values. If you change a token, the story updates automatically on reload.
2. **Component inventory** — The `COMPONENT_GROUPS` array in `DesignSystem.stories.tsx` is hand-maintained. When a new component ships under `src/options/components/cards|modals/`, `src/content/modals/`, or `src/content/toasts/`, **add a row to that array in the same PR** alongside its own `__stories__/*.stories.tsx`.
3. **Token descriptions** — The `OPTIONS_COLOR_GROUPS` array in the same file carries human-readable descriptions of each CSS variable. When a new token is added to `src/index.css`, add a description row so the palette story surfaces it.

## Contribution rules

Any UI-touching change should pass these self-checks before review:

- **New colour** — add the CSS variable to `src/index.css` (both `@theme` and `:root.dark` blocks) **and** a matching row in `OPTIONS_COLOR_GROUPS`. Verify contrast against the relevant contrast pair (black on accent, white on destructive, etc.) — the Color Palette story lists the expected ratios.
- **New content-script colour** — add to the `TOKENS` object in `src/content/tokens.ts` **and** a description to `CONTENT_TOKEN_DESCRIPTIONS` in the story file.
- **New component** — ship a `__stories__/<Name>.stories.tsx` with `LightMode` + `DarkMode` variants and add a row to `COMPONENT_GROUPS` in the design-system story.
- **New motion / radius / spacing token** — update `src/index.css`, the corresponding `RADII` / `TYPE_SCALE` / `SPACING` array in the story, and anywhere it's referenced in `docs/architecture.md`.

## Visual invariants (recap)

These are enforced by the `ux-reviewer` agent and cross-checked here:

- **Zero border-radius** on every UI element (the global reset in `src/index.css` makes this load-bearing). SVG `rx` attributes are the only opt-out — used for brand glyphs like the Instagram icon in the profile table.
- **Dark-first** palette. Accent: `#1ED760` paired with black text (~11:1, AAA). Previous `#1DB954` / white failed AA — don't regress.
- **CSS-only** micro-animations using `--duration-hover` / `--duration-focus` + `--ease-out-swift`. No JS animation libraries.
- **Shadow-DOM isolation** for every injected UI element. Content-script tokens never flip — they're dark-only because they render on Instagram's own themed surfaces.

## Reviewer coverage

Four project-local agents are aware of this design system:

- `ux-reviewer` — pulls up the Color Palette + Design Tokens stories when reviewing any UI diff, verifies new tokens were added to both source and the story.
- `code-reviewer` — verifies a new component comes with a story file and that the design-system inventory was updated.
- `documentation-reviewer` — verifies `docs/design-system.md` stays in sync with the story file and that `docs/README.md` indexes it.
- `extension-auditor` — notes whether any injected-UI change drifts from the content-script palette in `src/content/tokens.ts`.
