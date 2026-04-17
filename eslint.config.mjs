// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier/flat";

/**
 * ESLint configuration
 * @type {import("eslint/config").Config}
 */
const config = defineConfig([{
  ignores: ["dist/**", "artifacts/**", "node_modules/**", "coverage/**"],
}, {
  files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
  plugins: { js },
  extends: ["js/recommended"],
  languageOptions: { globals: globals.browser },
}, {
  // Node-only scripts run by `node` directly (build orchestrator, packagers,
  // web-ext config). They need access to Node globals like `process`.
  files: ["scripts/**/*.mjs", "*.config.mjs", "web-ext.config.mjs"],
  languageOptions: { globals: { ...globals.node, ...globals.browser } },
}, tseslint.configs.recommended, {
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
}, prettier, ...storybook.configs["flat/recommended"]]);

export default config;
