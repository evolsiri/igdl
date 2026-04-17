/**
 * web-ext configuration for Firefox dev-run and packaging.
 * Consumed by `pnpm run dev:firefox` and `pnpm run package:firefox`.
 */
export default {
  sourceDir: "./dist/firefox",
  artifactsDir: "./artifacts",
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ["about:debugging#/runtime/this-firefox"],
    browserConsole: true,
  },
  ignoreFiles: [
    "package.json",
    "pnpm-lock.yaml",
    "*.map",
  ],
};
