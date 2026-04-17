import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const unitProject = {
  extends: true,
  test: {
    environment: "jsdom",
    globals: false,
    include: [
      "src/**/__tests__/**/*.spec.ts",
      "src/**/__tests__/**/*.spec.tsx",
    ],
    restoreMocks: true,
    clearMocks: true
  }
};

const storybookProject = {
  extends: true,
  plugins: [
    storybookTest({
      configDir: path.join(dirname, '.storybook')
    })
  ],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{
        browser: 'chromium'
      }]
    }
  }
};

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [preact()],
  test: {
    projects: process.env.STORYBOOK_TESTS === '1'
      ? [unitProject, storybookProject]
      : [unitProject]
  }
});