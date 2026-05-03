/**
 * Lint-staged configuration.
 *
 * @type {import('lint-staged').Configuration}
 */
const config = {
  "**/*.{js,jsx,ts,tsx}": {
    title: "{js,jsx,ts,tsx} lint and format",
    task: async (files) => [
      `eslint --cache --fix ${files.join(" ")}`,
      `prettier --write ${files.join(" ")}`,
      "npm run test",
    ],
  },
  "**/*.{json,md}": {
    title: "{json,md} format",
    task: async (files) => [`prettier --write ${files.join(" ")}`],
  },
  "**/*.css": {
    title: "{css} format",
    task: async (files) => [`prettier --write ${files.join(" ")}`],
  },
};

export default config;
