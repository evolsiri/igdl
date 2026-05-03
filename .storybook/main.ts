import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { StorybookConfig } from "@storybook/preact-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
  ],
  framework: "@storybook/preact-vite",
  core: {
    disableTelemetry: true,
  },
  viteFinal(config) {
    const req = createRequire(import.meta.url);
    const shimDir = dirname(
      req.resolve("@storybook/react-dom-shim/package.json"),
    );
    const absoluteReact16 = `${shimDir}/dist/react-16.js`;
    const NON_ABSOLUTE = "@storybook/react-dom-shim/react-16";

    if (Array.isArray(config.resolve?.alias)) {
      config = {
        ...config,
        resolve: {
          ...config.resolve,
          alias: config.resolve.alias.map(
            (entry: { find: unknown; replacement: string }) =>
              entry.replacement === NON_ABSOLUTE
                ? { ...entry, replacement: absoluteReact16 }
                : entry,
          ),
        },
      };
    } else if (
      config.resolve?.alias &&
      typeof config.resolve.alias === "object"
    ) {
      const alias = { ...config.resolve.alias } as Record<string, string>;
      if (alias["@storybook/react-dom-shim"] === NON_ABSOLUTE) {
        alias["@storybook/react-dom-shim"] = absoluteReact16;
      }
      config = { ...config, resolve: { ...config.resolve, alias } };
    }

    const include = config.optimizeDeps?.include?.filter(
      (dep: string) => dep !== "@storybook/react-dom-shim",
    );
    return { ...config, optimizeDeps: { ...config.optimizeDeps, include } };
  },
};
export default config;
