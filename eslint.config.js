import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "node_modules/", "vendor/", "dist/", "**/dist/", "**/.astro/",
      ".test-output/", "test-results/", "playwright-report/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ["**/*.ts"] })),
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
    files: ["src/core/bootstrap.ts", "src/core/consent.ts", "src/client.ts", "tests/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["src/core/bootstrap.ts"],
    // This function is emitted as a classic script for the vendored loaders.
    rules: { "no-var": "off", "prefer-const": "off", "@typescript-eslint/no-this-alias": "off" },
  },
];
