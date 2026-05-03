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

  accent: "#a8f368",
  accentHover: "#b9f583",
  accentContrast: "#000000",

  destructive: "#f9035e",
  destructiveHover: "#fb3580",
  destructiveContrast: "#ffffff",

  success: "#a8f368",
  failure: "#f9035e",
  info: "#b3b3b3",

  focusRing: "#a8f368",

  brandGreen: "#a8f368",
  brandPink: "#f9035e",
} as const;

/**
 * Shared transition values — keeps micro-animations visually consistent
 * across modals, toasts, and the injected download button.
 */
export const MOTION = {
  hover: "120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
  focus: "160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;
