import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useEffect, useState } from "preact/hooks";
import { MOTION, TOKENS } from "../content/tokens";
import { ResetButton } from "../options/components/ResetButton";
import {
  ChevronDownGlyph,
  ChevronUpGlyph,
} from "../options/components/SortableTableHeader";

/**
 * Design System pages — visual reference for the igdl palette and primitives.
 * Three sibling stories under a shared `Design System/*` title:
 *
 *   Design System / Color Palette   (swatches, flip with the theme toolbar)
 *   Design System / Design Tokens   (radii, motion, typography)
 *   Design System / Icons & Buttons (glyph catalog, injected buttons, ResetButton, toast icons)
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
          Non-color primitives that the extension's UI rests on — radii,
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

// ---------------------------------------------------------------------------
// Icons & Buttons
// ---------------------------------------------------------------------------

// SVG paths for the three content-script injected button icons (from src/content/button.ts)
function DownloadGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 4v10.586l3.293-3.293 1.414 1.414L12 17.414 7.293 13.707l1.414-1.414L12 14.586V4h0zM4 20h16v2H4z" />
    </svg>
  );
}

function NewTabGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 3h7v7h-2V6.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V3zM5 5h6v2H5v12h12v-6h2v8H3V5h2z" />
    </svg>
  );
}

function ZipGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 3h11l5 5v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 2v14h14V9h-4V5H5zm6 3h2v2h-2V8zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z" />
    </svg>
  );
}

function GitHubGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
    </svg>
  );
}

function ToastSpinnerGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      style={{
        width: "14px",
        height: "14px",
        animation: "igdl-spin 0.7s linear infinite",
      }}
    >
      <style>{`@keyframes igdl-spin{to{transform:rotate(360deg)}}`}</style>
      <circle
        cx="8"
        cy="8"
        r="5.5"
        stroke={TOKENS.muted}
        stroke-width="2.5"
        stroke-opacity="0.35"
      />
      <path
        d="M8 2.5 A5.5 5.5 0 0 1 13.5 8"
        stroke={TOKENS.info}
        stroke-width="2.5"
      />
    </svg>
  );
}

interface InjectedBtnDemoProps {
  icon: preact.ComponentChildren;
  label: string;
  tooltip: string;
  color: "white" | "black";
}

function InjectedBtnDemo({ icon, label, tooltip, color }: InjectedBtnDemoProps) {
  const [hover, setHover] = useState(false);
  return (
    <div class="flex flex-col items-center gap-2">
      <span
        title={tooltip}
        style={{
          cursor: "pointer",
          padding: "8px",
          display: "inline-flex",
          color,
          transform: hover ? "scale(1.08)" : "scale(1)",
          transition: "transform 120ms ease-out",
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {icon}
      </span>
      <span class="font-mono text-xs text-muted">{label}</span>
    </div>
  );
}

const GLYPHS = [
  {
    label: "ResetGlyph",
    usage: "Options page reset-to-default action",
    file: "src/options/components/ResetButton.tsx",
    node: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    ),
  },
  {
    label: "DeleteGlyph",
    usage: "Options page delete-row action",
    file: "src/options/components/ResetButton.tsx",
    node: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    ),
  },
  {
    label: "ChevronUpGlyph",
    usage: "Sort ascending in ProfileDirectoriesCard table",
    file: "src/options/components/SortableTableHeader.tsx",
    node: <ChevronUpGlyph />,
  },
  {
    label: "ChevronDownGlyph",
    usage: "Sort descending in ProfileDirectoriesCard table",
    file: "src/options/components/SortableTableHeader.tsx",
    node: <ChevronDownGlyph />,
  },
  {
    label: "GitHubIcon",
    usage: "Footer link to the project repository",
    file: "src/options/App.tsx",
    node: <GitHubGlyph />,
  },
  {
    label: "InfoGlyph",
    usage: "Tooltip trigger inside NoDirPopup action buttons",
    file: "src/content/modals/NoDirPopup.tsx",
    node: <InfoGlyph />,
  },
  {
    label: "ToastSpinner",
    usage: "Animated spinner shown while a download is in progress",
    file: "src/content/toasts/Toast.tsx",
    node: <ToastSpinnerGlyph />,
  },
  {
    label: "InstagramGlyph",
    usage: "Instagram logo badge on profile-directory rows and never-ask rows",
    file: "src/options/components/cards/ProfileDirectoriesCard.tsx, NeverAskCard.tsx",
    node: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "InfoIcon",
    usage: "Inline info badge on NeverAskCard rows (distinct from NoDirPopup InfoGlyph)",
    file: "src/options/components/cards/NeverAskCard.tsx",
    node: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  {
    label: "FlaskIcon",
    usage: "Experimental feature badge in DownloadsCard",
    file: "src/options/components/cards/DownloadsCard.tsx",
    node: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10 3h4M10 3v6L5 20h14L14 9V3" />
      </svg>
    ),
  },
  {
    label: "MonitorIcon",
    usage: "System/auto theme option in AppearanceCard",
    file: "src/options/components/cards/AppearanceCard.tsx",
    node: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    label: "SunIcon",
    usage: "Light theme option in AppearanceCard",
    file: "src/options/components/cards/AppearanceCard.tsx",
    node: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    label: "MoonIcon",
    usage: "Dark theme option in AppearanceCard",
    file: "src/options/components/cards/AppearanceCard.tsx",
    node: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
];

export const IconsAndButtons: Story = {
  render: () => (
    <div class="max-w-5xl mx-auto space-y-10">
      <div class="flex justify-center">
        <img src="/logo.svg" width="96" height="96" alt="igdl" />
      </div>
      <header>
        <h1 class="text-3xl font-bold text-fg tracking-tight">
          Icons &amp; Buttons
        </h1>
        <p class="text-sm text-muted mt-2 max-w-prose">
          Every icon glyph and button pattern in the extension. Two surfaces:
          the options page (Tailwind + CSS vars) and the injected content-script
          UI (inline styles + Shadow DOM). No icon library — every glyph is a
          hand-crafted inline SVG.
        </p>
      </header>

      {/* ── Injected content-script buttons ────────────────────────────── */}
      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">
          Injected download buttons
        </h2>
        <p class="text-sm text-muted mb-4">
          Defined in{" "}
          <code class="font-mono text-xs">src/content/button.ts</code>. Injected
          directly into Instagram / Threads DOM as{" "}
          <code class="font-mono text-xs">&lt;a class="igdl-custom-btn …"&gt;</code>{" "}
          anchors. Icons are 24×24,{" "}
          <code class="font-mono text-xs">fill: currentColor</code>. Hover
          animates <code class="font-mono text-xs">scale(1.08)</code> at{" "}
          <code class="font-mono text-xs">120ms ease-out</code>. Icon color is
          black (post / feed) or white (story / reel overlay) depending on the
          surrounding Instagram surface.
        </p>
        <div class="bg-surface border border-border px-5 py-6 space-y-6">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted mb-3">
              On dark background (stories / reels)
            </p>
            <div
              class="flex gap-2 items-center p-4"
              style={{ background: TOKENS.bg }}
            >
              <InjectedBtnDemo
                icon={<DownloadGlyph />}
                label="download-btn"
                tooltip="Download. Or, right-click to 'Save as'"
                color="white"
              />
              <InjectedBtnDemo
                icon={<NewTabGlyph />}
                label="newtab-btn"
                tooltip="Open in new tab"
                color="white"
              />
              <InjectedBtnDemo
                icon={<ZipGlyph />}
                label="zip-btn"
                tooltip="Download ZIP"
                color="white"
              />
            </div>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted mb-3">
              On light background (posts / feed)
            </p>
            <div class="flex gap-2 items-center p-4 bg-white">
              <InjectedBtnDemo
                icon={<DownloadGlyph />}
                label="download-btn"
                tooltip="Download. Or, right-click to 'Save as'"
                color="black"
              />
              <InjectedBtnDemo
                icon={<NewTabGlyph />}
                label="newtab-btn"
                tooltip="Open in new tab"
                color="black"
              />
              <InjectedBtnDemo
                icon={<ZipGlyph />}
                label="zip-btn"
                tooltip="Download ZIP"
                color="black"
              />
            </div>
          </div>
          <p class="text-xs text-muted">
            <code class="font-mono">zip-btn</code> is only injected on desktop
            (non-mobile) Instagram posts — never on stories, reels, or Threads.{" "}
            <code class="font-mono">newtab-btn</code> is hidden on mobile
            stories.
          </p>
        </div>
      </section>

      {/* ── Options-page icon buttons ───────────────────────────────────── */}
      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">
          Options-page icon buttons — ResetButton
        </h2>
        <p class="text-sm text-muted mb-4">
          Defined in{" "}
          <code class="font-mono text-xs">
            src/options/components/ResetButton.tsx
          </code>
          . 32×32 border-box, icon-only, two variants. Hover transitions
          background, text, and border to the variant's accent color and nudges{" "}
          <code class="font-mono text-xs">scale(1.05)</code>; active presses to{" "}
          <code class="font-mono text-xs">scale(0.95)</code>.
        </p>
        <div class="bg-surface border border-border px-5 py-6">
          <div class="overflow-hidden">
            <table class="w-full text-sm">
              <thead class="text-xs uppercase tracking-wide text-muted border-b border-border">
                <tr>
                  <th class="text-left px-4 py-2 font-medium w-[18%]">
                    Variant
                  </th>
                  <th class="text-left px-4 py-2 font-medium w-[16%]">
                    Default
                  </th>
                  <th class="text-left px-4 py-2 font-medium w-[16%]">
                    Disabled
                  </th>
                  <th class="text-left px-4 py-2 font-medium">Usage</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-mono text-xs text-fg align-middle">
                    reset
                  </td>
                  <td class="px-4 py-3 align-middle">
                    <ResetButton
                      onClick={() => {}}
                      title="Reset to default"
                      variant="reset"
                    />
                  </td>
                  <td class="px-4 py-3 align-middle">
                    <ResetButton
                      onClick={() => {}}
                      title="Reset to default"
                      variant="reset"
                      disabled
                    />
                  </td>
                  <td class="px-4 py-3 text-xs text-muted align-middle">
                    Reverts a single profile row's directory to the global
                    default. Hover accent:{" "}
                    <code class="font-mono text-xs">--color-accent</code>.
                  </td>
                </tr>
                <tr class="border-t border-border">
                  <td class="px-4 py-3 font-mono text-xs text-fg align-middle">
                    delete
                  </td>
                  <td class="px-4 py-3 align-middle">
                    <ResetButton
                      onClick={() => {}}
                      title="Delete row"
                      variant="delete"
                    />
                  </td>
                  <td class="px-4 py-3 align-middle">
                    <ResetButton
                      onClick={() => {}}
                      title="Delete row"
                      variant="delete"
                      disabled
                    />
                  </td>
                  <td class="px-4 py-3 text-xs text-muted align-middle">
                    Removes a profile-directory row permanently. Hover accent:{" "}
                    <code class="font-mono text-xs">--color-destructive</code>.
                    Opens a ConfirmDialog before acting.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── All icon glyphs ─────────────────────────────────────────────── */}
      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">Icon glyph catalog</h2>
        <p class="text-sm text-muted mb-4">
          Every inline SVG glyph in the codebase. All use{" "}
          <code class="font-mono text-xs">currentColor</code> so they inherit
          their parent's text color. No external icon font or sprite sheet.
        </p>
        <div class="bg-surface border border-border overflow-hidden">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase tracking-wide text-muted border-b border-border">
              <tr>
                <th class="text-left px-4 py-2 font-medium w-[10%]">Glyph</th>
                <th class="text-left px-4 py-2 font-medium w-[28%]">Name</th>
                <th class="text-left px-4 py-2 font-medium w-[30%]">Source</th>
                <th class="text-left px-4 py-2 font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {GLYPHS.map((g) => (
                <tr key={g.label} class="border-t border-border">
                  <td class="px-4 py-3 text-fg align-middle">{g.node}</td>
                  <td class="px-4 py-3 font-mono text-xs text-fg align-middle">
                    {g.label}
                  </td>
                  <td class="px-4 py-3 font-mono text-xs text-muted align-middle">
                    {g.file}
                  </td>
                  <td class="px-4 py-3 text-xs text-muted align-middle">
                    {g.usage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Toast status icons ──────────────────────────────────────────── */}
      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">Toast status icons</h2>
        <p class="text-sm text-muted mb-4">
          Defined in{" "}
          <code class="font-mono text-xs">src/content/toasts/Toast.tsx</code>.
          The <code class="font-mono text-xs">loading</code> kind renders the
          animated spinner above; the other three use Unicode characters so they
          render in the shadow-DOM context without an external font.
        </p>
        <div class="bg-surface border border-border overflow-hidden">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase tracking-wide text-muted border-b border-border">
              <tr>
                <th class="text-left px-4 py-2 font-medium w-[12%]">Kind</th>
                <th class="text-left px-4 py-2 font-medium w-[14%]">Icon</th>
                <th class="text-left px-4 py-2 font-medium w-[20%]">
                  Accent color
                </th>
                <th class="text-left px-4 py-2 font-medium">Semantics</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    kind: "success",
                    icon: "✓",
                    tokenKey: "success" as keyof typeof TOKENS,
                    note: "role=status — download completed",
                  },
                  {
                    kind: "failure",
                    icon: "✕",
                    tokenKey: "failure" as keyof typeof TOKENS,
                    note: "role=alert — download or network error",
                  },
                  {
                    kind: "info",
                    icon: "i",
                    tokenKey: "info" as keyof typeof TOKENS,
                    note: "role=status — user-canceled or informational",
                  },
                  {
                    kind: "loading",
                    icon: null,
                    tokenKey: "info" as keyof typeof TOKENS,
                    note: "role=status — download in progress",
                  },
                ] as const
              ).map(({ kind, icon, tokenKey, note }) => (
                <tr key={kind} class="border-t border-border">
                  <td class="px-4 py-3 font-mono text-xs text-fg align-middle">
                    {kind}
                  </td>
                  <td class="px-4 py-3 align-middle">
                    {icon !== null ? (
                      <span
                        style={{
                          color: TOKENS[tokenKey],
                          fontSize: "16px",
                          lineHeight: "1",
                        }}
                      >
                        {icon}
                      </span>
                    ) : (
                      <ToastSpinnerGlyph />
                    )}
                  </td>
                  <td class="px-4 py-3 align-middle">
                    <span class="inline-flex items-center gap-2">
                      <span
                        class="inline-block w-3 h-3 border border-border"
                        style={{ background: TOKENS[tokenKey] }}
                      />
                      <span class="font-mono text-xs text-muted">
                        TOKENS.{tokenKey}
                      </span>
                    </span>
                  </td>
                  <td class="px-4 py-3 text-xs text-muted align-middle">
                    {note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  ),
};

