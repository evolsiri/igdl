/**
 * Lint-staged configuration.
 *
 * Filenames are JSON-quoted before being interpolated into shell commands so
 * paths containing spaces or shell metacharacters survive the round trip.
 *
 * @type {import('lint-staged').Configuration}
 */
const quote = (files) => files.map((f) => JSON.stringify(f)).join(" ");

const config = {
  "**/*.{js,jsx,ts,tsx}": {
    title: "{js,jsx,ts,tsx} lint and format",
    task: async (files) => [
      `eslint --cache --fix ${quote(files)}`,
      `prettier --write ${quote(files)}`,
      "npm run test",
    ],
  },
  "**/*.json": {
    title: "{json} format",
    task: async (files) => [`prettier --write ${quote(files)}`],
  },
  "**/*.md": {
    title: "{md} format and hex-literal guard",
    task: async (files) => [
      `prettier --write ${quote(files)}`,
      `node ./scripts/check-hex-literals.mjs ${quote(files)}`,
    ],
  },
  "**/*.css": {
    title: "{css} format",
    task: async (files) => [`prettier --write ${quote(files)}`],
  },
};

export default config;
