import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useEffect, useState } from "preact/hooks";
import { MOTION, TOKENS } from "../content/tokens";

/**
 * Design System pages — visual reference for the igdl palette and primitives.
 * Two sibling stories under a shared `Design System/*` title:
 *
 *   Design System / Color Palette   (swatches, flip with the theme toolbar)
 *   Design System / Design Tokens   (radii, motion, typography)
 *
 * Swatches read live CSS vars via `getComputedStyle`, so the hex values
 * update whenever the theme decorator in .storybook/preview.ts toggles
 * the `.dark` class. Content-script swatches are dark-only (they live in
 * `src/content/tokens.ts` and never flip).
 */

const meta: Meta = {
  title: "Design System",
  parameters: { layout: "padded" },
  tags: ["!autodocs"],
};
export default meta;

type Story = StoryObj;

// ---------------------------------------------------------------------------
// Color Palette
// ---------------------------------------------------------------------------

interface CssSwatch {
  readonly varName: string;
  readonly description: string;
}

interface CssGroup {
  readonly name: string;
  readonly swatches: readonly CssSwatch[];
}

// Kept in sync with src/index.css. Keep groups & order readable — this table
// is the one-pager new contributors read to learn the palette.
const OPTIONS_COLOR_GROUPS: readonly CssGroup[] = [
  {
    name: "Surfaces",
    swatches: [
      { varName: "--color-bg", description: "Page background" },
      { varName: "--color-surface", description: "Card / modal surface" },
      {
        varName: "--color-surface-hover",
        description: "Hover state on surfaces",
      },
      { varName: "--color-border", description: "1px row and card borders" },
    ],
  },
  {
    name: "Text",
    swatches: [
      { varName: "--color-fg", description: "Primary foreground text" },
      { varName: "--color-muted", description: "Secondary / metadata text" },
    ],
  },
  {
    name: "Accent",
    swatches: [
      {
        varName: "--color-accent",
        description: "brand-green — buttons, focus, links",
      },
      { varName: "--color-accent-hover", description: "Accent hover state" },
      {
        varName: "--color-accent-contrast",
        description: "Black text on accent fills (~15.7:1 AAA)",
      },
    ],
  },
  {
    name: "Destructive",
    swatches: [
      {
        varName: "--color-destructive",
        description: "Delete / reset confirmations",
      },
      {
        varName: "--color-destructive-hover",
        description: "Destructive hover state",
      },
      {
        varName: "--color-destructive-contrast",
        description: "Text on destructive fills",
      },
    ],
  },
  {
    name: "Toasts",
    swatches: [
      { varName: "--color-success", description: "Success toast accent bar" },
      { varName: "--color-failure", description: "Failure toast accent bar" },
    ],
  },
  {
    name: "Focus",
    swatches: [
      {
        varName: "--color-focus-ring",
        description: "Global :focus-visible outline",
      },
    ],
  },
  {
    name: "Brand",
    swatches: [
      {
        varName: "--color-brand-green",
        description: "Logo background + accent — brand-green",
      },
      {
        varName: "--color-brand-pink",
        description: "Destructive / error / failure — brand-pink",
      },
    ],
  },
];

function useLiveHex(varName: string): string {
  const [hex, setHex] = useState("");
  useEffect(() => {
    function read() {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue(varName)
        .trim();
      setHex(raw || "—");
    }
    read();
    // Theme toolbar toggles `.dark` on <html>; MutationObserver catches that
    // so the hex readout updates without a remount.
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => mo.disconnect();
  }, [varName]);
  return hex;
}

function CssSwatchCard({ swatch }: { swatch: CssSwatch }) {
  const hex = useLiveHex(swatch.varName);
  return (
    <div class="bg-surface border border-border">
      <div
        class="h-16 border-b border-border"
        style={{ background: `var(${swatch.varName})` }}
      />
      <div class="px-3 py-2">
        <div class="font-mono text-xs text-fg">{swatch.varName}</div>
        <div class="font-mono text-xs text-muted uppercase">{hex}</div>
        <div class="text-xs text-muted mt-1">{swatch.description}</div>
      </div>
    </div>
  );
}

function HexSwatchCard({
  label,
  hex,
  description,
}: {
  label: string;
  hex: string;
  description: string;
}) {
  return (
    <div class="bg-surface border border-border">
      <div class="h-16 border-b border-border" style={{ background: hex }} />
      <div class="px-3 py-2">
        <div class="font-mono text-xs text-fg">{label}</div>
        <div class="font-mono text-xs text-muted uppercase">{hex}</div>
        <div class="text-xs text-muted mt-1">{description}</div>
      </div>
    </div>
  );
}

const CONTENT_TOKEN_DESCRIPTIONS: Record<keyof typeof TOKENS, string> = {
  bg: "Shadow-DOM panel background",
  surface: "Popup / toast surface",
  surfaceHover: "Hover state on content-script surfaces",
  border: "1px border inside shadow-DOM panels",
  fg: "Primary text inside injected UI",
  muted: "Secondary text inside injected UI",
  accent: "brand-green in content-script UI",
  accentHover: "Accent hover (e.g., Save & download button)",
  accentContrast: "Black text on accent fills",
  destructive: "Destructive state inside injected UI",
  destructiveHover: "Destructive hover state",
  destructiveContrast: "Text on destructive fills",
  success: "Success toast accent bar",
  failure: "Failure toast accent bar",
  info: "Info toast accent bar (e.g., user-canceled download)",
  focusRing: ":focus-visible outline in injected UI",
  brandGreen: "Logo background + accent — brand-green",
  brandPink: "Destructive / error / failure — brand-pink",
};

export const ColorPalette: Story = {
  render: () => (
    <div class="max-w-5xl mx-auto space-y-8">
      <div class="flex justify-center">
        <img src="/logo.svg" width="96" height="96" alt="igdl" />
      </div>
      <header>
        <h1 class="text-3xl font-bold text-fg tracking-tight">Color Palette</h1>
        <p class="text-sm text-muted mt-2 max-w-prose">
          Every token the options page and injected UI rely on. Use the theme
          toolbar (top right) to flip between light and dark — the options-page
          swatches reflect the live CSS variable values.
        </p>
      </header>

      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">
          Options page — CSS variables
        </h2>
        <p class="text-sm text-muted mb-4">
          Defined in <code class="font-mono text-xs">src/index.css</code>. Both
          themes are represented; toggle the toolbar to swap.
        </p>
        {OPTIONS_COLOR_GROUPS.map((group) => (
          <div key={group.name} class="mb-6">
            <h3 class="text-xs font-medium uppercase tracking-wide text-muted mb-2">
              {group.name}
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.swatches.map((s) => (
                <CssSwatchCard key={s.varName} swatch={s} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">
          Content-script — TypeScript tokens
        </h2>
        <p class="text-sm text-muted mb-4">
          Defined in{" "}
          <code class="font-mono text-xs">src/content/tokens.ts</code>. These
          mount inside Shadow DOMs on Instagram/Threads and never flip — always
          dark-palette regardless of the surrounding page theme.
        </p>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {(
            Object.entries(TOKENS) as ReadonlyArray<
              [keyof typeof TOKENS, string]
            >
          ).map(([key, hex]) => (
            <HexSwatchCard
              key={key}
              label={`TOKENS.${key}`}
              hex={hex}
              description={CONTENT_TOKEN_DESCRIPTIONS[key]}
            />
          ))}
        </div>
      </section>

      <section class="bg-surface border border-border px-5 py-4">
        <h3 class="text-sm font-semibold text-fg mb-1">Contrast note</h3>
        <p class="text-sm text-muted">
          <span class="font-mono text-xs">#000000</span> +{" "}
          <span class="font-mono text-xs">#a8f368</span> ≈{" "}
          <strong class="text-fg">15.7:1</strong> (WCAG AAA). Every brand-green
          fill in igdl pairs with black text — that's the accent, success
          toast bar, focus ring, and the logo's square background.
        </p>
        <p class="text-sm text-muted mt-3">
          Destructive / error / failure states use{" "}
          <code class="font-mono text-xs">--color-brand-pink</code> (
          <span class="font-mono text-xs">#f9035e</span>) paired with white
          text (~<span class="font-mono text-xs">4.0:1</span>, AA Large).
          Same hex backs both <code class="font-mono text-xs">--color-destructive</code>{" "}
          and <code class="font-mono text-xs">--color-failure</code>, so
          confirm dialogs, reset-all flows, and failure toasts all match.
        </p>
      </section>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Design Tokens (non-color primitives)
// ---------------------------------------------------------------------------


const TYPE_SCALE = [
  {
    className: "text-xs",
    size: "12px",
    usage: "Dense metadata, relative timestamps, code inline",
  },
  {
    className: "text-sm",
    size: "14px",
    usage: "Body text, form labels, table cells",
  },
  {
    className: "text-base",
    size: "16px",
    usage: "Default body (rarely used explicitly)",
  },
  { className: "text-lg", size: "18px", usage: "Card titles" },
  { className: "text-xl", size: "20px", usage: "Secondary headings" },
  { className: "text-3xl", size: "30px", usage: "Options-page h1" },
];

const SPACING = [
  {
    token: "gap-3 / py-3",
    px: "12px",
    usage: "Row padding + flex gaps in cards",
  },
  { token: "gap-2 / py-2", px: "8px", usage: "Compact stacks, button groups" },
  {
    token: "mb-8",
    px: "32px",
    usage: "Header → first card gap on options page",
  },
  { token: "px-6 py-5", px: "24 / 20px", usage: "Card interior padding" },
];

function MotionDemo({
  label,
  durationMs,
  tokenName,
}: {
  label: string;
  durationMs: number;
  tokenName: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div class="flex items-center gap-4">
      <div
        class="w-16 h-16 bg-accent"
        style={{
          transform: hover ? "scale(1.2)" : "scale(1)",
          opacity: hover ? 1 : 0.6,
          transition: `transform ${durationMs}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${durationMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={`Hover to preview ${label}`}
      />
      <div>
        <div class="text-sm font-medium text-fg">{label}</div>
        <div class="font-mono text-xs text-muted">{tokenName}</div>
        <div class="text-xs text-muted">
          {durationMs}ms · cubic-bezier(0.2, 0.8, 0.2, 1)
        </div>
      </div>
    </div>
  );
}

export const DesignTokens: Story = {
  render: () => (
    <div class="max-w-5xl mx-auto space-y-8">
      <div class="flex justify-center">
        <img src="/logo.svg" width="96" height="96" alt="igdl" />
      </div>
      <header>
        <h1 class="text-3xl font-bold text-fg tracking-tight">Design Tokens</h1>
        <p class="text-sm text-muted mt-2 max-w-prose">
          Non-colour primitives that the extension's UI rests on — radii,
          motion, typography, spacing.
        </p>
      </header>

      <section class="bg-surface border border-border px-5 py-4">
        <h2 class="text-sm font-semibold text-fg mb-1">Radii — all zero</h2>
        <p class="text-sm text-muted">
          Every radius token (<code class="font-mono text-xs">--radius-none</code>{" "}
          through <code class="font-mono text-xs">--radius-full</code>) is{" "}
          <code class="font-mono text-xs">0</code>. A global reset in{" "}
          <code class="font-mono text-xs">src/index.css</code> enforces{" "}
          <code class="font-mono text-xs">border-radius: 0 !important</code> on
          every element. Only SVG <code class="font-mono text-xs">rx</code>{" "}
          attributes opt out (brand logo glyphs).
        </p>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">Motion</h2>
        <p class="text-sm text-muted mb-4">
          Two micro-animation durations used across the extension. Hover the
          boxes to feel the difference — the ease curve is shared.
        </p>
        <div class="bg-surface border border-border px-5 py-6 space-y-6">
          <MotionDemo
            label="Hover"
            durationMs={120}
            tokenName="--duration-hover / MOTION.hover"
          />
          <MotionDemo
            label="Focus"
            durationMs={160}
            tokenName="--duration-focus / MOTION.focus"
          />
        </div>
        <p class="text-xs text-muted mt-2">
          Defined in <code class="font-mono text-xs">src/index.css</code> and{" "}
          <code class="font-mono text-xs">src/content/tokens.ts</code>. Ease:{" "}
          <code class="font-mono text-xs">
            {MOTION.hover.split(" ").slice(1).join(" ")}
          </code>
          .
        </p>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">Typography</h2>
        <p class="text-sm text-muted mb-4">
          One stack —{" "}
          <code class="font-mono text-xs">Circular, system-ui, …</code> (
          <code class="font-mono text-xs">src/index.css:90</code>). Sizes below
          are the Tailwind ramp values actually used in the extension.
        </p>
        <div class="bg-surface border border-border overflow-hidden">
          <table class="w-full">
            <thead class="text-xs uppercase tracking-wide text-muted border-b border-border">
              <tr>
                <th class="text-left px-4 py-2 font-medium w-[14%]">Class</th>
                <th class="text-left px-4 py-2 font-medium w-[10%]">Size</th>
                <th class="text-left px-4 py-2 font-medium w-[30%]">Sample</th>
                <th class="text-left px-4 py-2 font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {TYPE_SCALE.map((t) => (
                <tr key={t.className} class="border-t border-border">
                  <td class="px-4 py-2 font-mono text-xs text-fg align-middle">
                    {t.className}
                  </td>
                  <td class="px-4 py-2 font-mono text-xs text-muted align-middle">
                    {t.size}
                  </td>
                  <td class={`px-4 py-2 text-fg align-middle ${t.className}`}>
                    Download profile media
                  </td>
                  <td class="px-4 py-2 text-xs text-muted align-middle">
                    {t.usage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">Spacing</h2>
        <p class="text-sm text-muted mb-4">
          Tailwind scale values most frequently reached for in the options page
          and content-script UI.
        </p>
        <div class="bg-surface border border-border overflow-hidden">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase tracking-wide text-muted border-b border-border">
              <tr>
                <th class="text-left px-4 py-2 font-medium w-[28%]">Token</th>
                <th class="text-left px-4 py-2 font-medium w-[14%]">Px</th>
                <th class="text-left px-4 py-2 font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {SPACING.map((s) => (
                <tr key={s.token} class="border-t border-border">
                  <td class="px-4 py-2 font-mono text-xs text-fg">{s.token}</td>
                  <td class="px-4 py-2 font-mono text-xs text-muted">{s.px}</td>
                  <td class="px-4 py-2 text-xs text-muted">{s.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  ),
};

