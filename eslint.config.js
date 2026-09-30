import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/", "vendor/", "dist/", "**/dist/", "**/.astro/",
      ".test-output/", "test-results/", "playwright-report/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // Code that runs in the page: the serialized bootstrap, the consent helper,
    // and test callbacks evaluated inside the browser.
    files: ["src/core/bootstrap.js", "src/core/consent.js", "src/client.js", "tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
