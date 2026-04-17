/**
 * Dark-palette color tokens used by every shadow-DOM-mounted component
 * in the content script. Inline styles sidestep the Tailwind-in-shadow-DOM
 * CSS-injection problem — we don't need utility classes inside our modals
 * and toasts; the shadow root already isolates Instagram's styles.
 *
 * Injected UI always uses the dark palette (matches Instagram's dark-first
 * defaults and is readable on their light theme too). Options-page UI keeps
 * the light/dark switch via ThemeService.
 */
export const TOKENS = {
  bg: "#121212",
  surface: "#181818",
  surfaceHover: "#282828",
  border: "#2a2a2a",
  fg: "#ffffff",
  muted: "#b3b3b3",

  accent: "#1ed760",
  accentHover: "#25e06b",
  accentContrast: "#000000",

  destructive: "#e22134",
  destructiveHover: "#f25062",
  destructiveContrast: "#ffffff",

  success: "#1ed760",
  failure: "#e22134",

  focusRing: "#1ed760",
} as const;

/**
 * Shared transition values — keeps micro-animations visually consistent
 * across modals, toasts, and the injected download button.
 */
export const MOTION = {
  hover: "120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
  focus: "160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;
