import type { Meta, StoryObj } from "@storybook/preact-vite";
import { useEffect, useState } from "preact/hooks";
import { MOTION, TOKENS } from "../content/tokens";

/**
 * Design System pages — one-stop visual reference for the igdl palette,
 * primitives, and component inventory. Three sibling stories under a
 * shared `Design System/*` title:
 *
 *   Design System / Color Palette   (swatches, flip with the theme toolbar)
 *   Design System / Design Tokens   (radii, motion, typography)
 *   Design System / Components      (hand-maintained inventory)
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
        description: "Primary green — buttons, focus, links",
      },
      { varName: "--color-accent-hover", description: "Accent hover state" },
      {
        varName: "--color-accent-contrast",
        description: "Text on accent fills (~11:1 AAA)",
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
  accent: "Primary green in content-script UI",
  accentHover: "Accent hover (e.g., Save & download button)",
  accentContrast: "Text on accent fills (always black)",
  destructive: "Destructive state inside injected UI",
  destructiveHover: "Destructive hover state",
  destructiveContrast: "Text on destructive fills",
  success: "Success toast accent bar",
  failure: "Failure toast accent bar",
  info: "Info toast accent bar (e.g., user-canceled download)",
  focusRing: ":focus-visible outline in injected UI",
};

export const ColorPalette: Story = {
  render: () => (
    <div class="max-w-5xl mx-auto space-y-8">
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
          <span class="font-mono text-xs">#1ED760</span> +{" "}
          <span class="font-mono text-xs">#000000</span> ≈{" "}
          <strong class="text-fg">11:1</strong> (WCAG AAA). Every green fill in
          igdl pairs with black text. The previous{" "}
          <span class="font-mono text-xs">#1DB954</span> green + white text was{" "}
          <span class="font-mono text-xs">2.5:1</span> and failed AA — the
          palette was tightened for this reason.
        </p>
      </section>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Design Tokens (non-color primitives)
// ---------------------------------------------------------------------------

const RADII = [
  { token: "--radius-none", value: "0" },
  { token: "--radius-sm", value: "0" },
  { token: "--radius-md", value: "0" },
  { token: "--radius-lg", value: "0" },
  { token: "--radius-xl", value: "0" },
  { token: "--radius-full", value: "0" },
];

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
      <header>
        <h1 class="text-3xl font-bold text-fg tracking-tight">Design Tokens</h1>
        <p class="text-sm text-muted mt-2 max-w-prose">
          Non-colour primitives that the extension's UI rests on — radii,
          motion, typography, spacing.
        </p>
      </header>

      <section>
        <h2 class="text-lg font-semibold text-fg mb-1">Radii</h2>
        <p class="text-sm text-muted mb-4">
          CLAUDE.md rule: every UI element is a sharp rectangle. All radius
          tokens are pinned to <code class="font-mono text-xs">0</code>, and a
          global reset (
          <code class="font-mono text-xs">src/index.css:80-83</code>) forces{" "}
          <code class="font-mono text-xs">border-radius: 0 !important</code> on
          every element. Only SVG <code class="font-mono text-xs">rx</code>{" "}
          attributes opt out (the Instagram logo in the profile table).
        </p>
        <div class="bg-surface border border-border overflow-hidden">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase tracking-wide text-muted border-b border-border">
              <tr>
                <th class="text-left px-4 py-2 font-medium">Token</th>
                <th class="text-left px-4 py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {RADII.map((r) => (
                <tr key={r.token} class="border-t border-border">
                  <td class="px-4 py-2 font-mono text-xs text-fg">{r.token}</td>
                  <td class="px-4 py-2 font-mono text-xs text-muted">
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          Defined in <code class="font-mono text-xs">src/index.css:45-47</code>{" "}
          and <code class="font-mono text-xs">src/content/tokens.ts:37-40</code>
          . Ease:{" "}
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
// Components inventory
// ---------------------------------------------------------------------------

interface ComponentEntry {
  readonly name: string;
  readonly summary: string;
  readonly storyPath: string;
}

interface ComponentGroup {
  readonly name: string;
  readonly note: string;
  readonly entries: readonly ComponentEntry[];
}

// Kept in sync with src/options/components/ + src/content/. When a new
// component ships under one of those roots, add a row here.
const COMPONENT_GROUPS: readonly ComponentGroup[] = [
  {
    name: "Options · Shared",
    note: "Primitives used across every options-page card.",
    entries: [
      {
        name: "Card",
        summary:
          "Framed section container with title, subtitle, and optional header action.",
        storyPath: "Options / Shared / Card",
      },
      {
        name: "ConfirmDialog",
        summary:
          "Native <dialog> modal for confirm / cancel flows. Info + destructive variants.",
        storyPath: "Options / Shared / ConfirmDialog",
      },
      {
        name: "ResetButton",
        summary:
          "32×32 icon button — reset or delete glyph, for inline row actions.",
        storyPath: "Options / Shared / ResetButton",
      },
      {
        name: "SearchInput",
        summary: "Single-row search field used to filter rows inside cards.",
        storyPath: "Options / Shared / SearchInput",
      },
      {
        name: "SortableTableHeader",
        summary:
          "Table `<th>` with a stacked up/down chevron pair; drives per-column asc/desc sort.",
        storyPath: "Options / Shared / SortableTableHeader",
      },
      {
        name: "TextField",
        summary:
          "Labelled text input with optional description and per-row reset button.",
        storyPath: "Options / Shared / TextField",
      },
      {
        name: "Toggle",
        summary: "Switch with label, description, and optional reset.",
        storyPath: "Options / Shared / Toggle",
      },
    ],
  },
  {
    name: "Options · Cards",
    note: "Top-level sections on the options page. Each composes the shared primitives above.",
    entries: [
      {
        name: "AppearanceCard",
        summary:
          "Theme selector (system / light / dark) — controls ThemeService.",
        storyPath: "Options / Cards / AppearanceCard",
      },
      {
        name: "DownloadsCard",
        summary:
          "Every download-related setting (directories, filename, toggles) with search.",
        storyPath: "Options / Cards / DownloadsCard",
      },
      {
        name: "ImportExportCard",
        summary:
          "Export current settings to a JSON file or import a previously exported file.",
        storyPath: "Options / Cards / ImportExportCard",
      },
      {
        name: "NeverAskCard",
        summary: "Manage the never-ask profile list.",
        storyPath: "Options / Cards / NeverAskCard",
      },
      {
        name: "ProfileDirectoriesCard",
        summary:
          "Per-profile routing table: edit, add, delete, open on Instagram.",
        storyPath: "Options / Cards / ProfileDirectoriesCard",
      },
      {
        name: "ResetAllCard",
        summary: "Destructive reset-all flow with confirm dialog.",
        storyPath: "Options / Cards / ResetAllCard",
      },
    ],
  },
  {
    name: "Options · Modals",
    note: "Native <dialog> modals launched from cards.",
    entries: [
      {
        name: "AddProfileModal",
        summary: "Add a new per-profile directory from ProfileDirectoriesCard.",
        storyPath: "Options / Modals / AddProfileModal",
      },
    ],
  },
  {
    name: "Content · Modals",
    note: "On-page UI mounted inside a Shadow DOM on Instagram / Threads.",
    entries: [
      {
        name: "NoDirPopup",
        summary:
          "Three-choice popup for first-time downloads on un-configured profiles.",
        storyPath: "Content / Modals / NoDirPopup",
      },
    ],
  },
  {
    name: "Content · Toasts",
    note: "Bottom-right status toasts fired from download flows.",
    entries: [
      {
        name: "Toast / ToastStack",
        summary: "Auto-dismissing success/failure toast + a stacking wrapper.",
        storyPath: "Content / Toasts / Toast",
      },
    ],
  },
];

export const Components: Story = {
  render: () => (
    <div class="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 class="text-3xl font-bold text-fg tracking-tight">Components</h1>
        <p class="text-sm text-muted mt-2 max-w-prose">
          Every Preact component shipped in the extension, grouped by where it
          lives. Each entry points to its interactive story in the sidebar.
        </p>
      </header>

      {COMPONENT_GROUPS.map((group) => (
        <section key={group.name}>
          <h2 class="text-lg font-semibold text-fg">{group.name}</h2>
          <p class="text-sm text-muted mb-4">{group.note}</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.entries.map((entry) => (
              <div
                key={entry.name}
                class="bg-surface border border-border px-4 py-3"
              >
                <div class="text-sm font-semibold text-fg">{entry.name}</div>
                <p class="text-xs text-muted mt-1">{entry.summary}</p>
                <p class="text-xs text-muted mt-2">
                  See{" "}
                  <span class="font-mono text-xs text-fg">
                    {entry.storyPath}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};
