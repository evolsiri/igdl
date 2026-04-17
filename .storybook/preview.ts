import type { Decorator, Preview } from "@storybook/preact-vite";
import "../src/index.css";

type Theme = "light" | "dark";

/**
 * Mirrors ThemeService.apply() from src/services/ThemeService — toggles a
 * `dark` class on <html> so Tailwind v4 tokens in src/index.css flip. Stories
 * can pin a theme via parameters.forceTheme; otherwise the toolbar global wins.
 */
const withTheme: Decorator = (Story, context) => {
  const forced = (context.parameters as { forceTheme?: Theme }).forceTheme;
  const theme: Theme = forced ?? (context.globals.theme as Theme) ?? "dark";
  document.documentElement.classList.toggle("dark", theme === "dark");
  return Story(context.args, context);
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "igdl theme (toggles the .dark class on <html>)",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "dark", value: "#121212" },
      ],
    },
    a11y: {
      config: {
        rules: [
          // Focus-visible outlines are global in src/index.css; skip the
          // color-contrast audit on elements that only gain color on focus.
          { id: "color-contrast", enabled: true },
        ],
      },
    },
    layout: "centered",
  },
};

export default preview;
