import { createInstallation, normalizeOptions } from "./core/index.js";

/**
 * Install exactly one Basicrum loader on every Astro page.
 *
 * This file is the Astro adapter. All Boomerang, loader and option logic
 * lives in ./core/ so that it can be reused by other frameworks.
 * @param {import('./index.d.ts').BasicrumOptions} options
 * @returns {import('astro').AstroIntegration}
 */
export default function basicrum(options) {
  const settings = normalizeOptions(options);
  return {
    name: "@basicrum/astro",
    hooks: {
      "astro:config:setup": ({ config, command, injectScript, injectRoute }) => {
        if (!(settings.enabled ?? command === "build")) return;

        // Injected route patterns are relative to Astro's base; browser URLs are not.
        const { assetPath, bootstrap } = createInstallation(settings, {
          generator: "astro",
          base: config.base,
        });

        injectRoute({
          pattern: assetPath,
          entrypoint: new URL("./boomerang-endpoint.js", import.meta.url),
          prerender: true,
        });
        // A classic head script preserves the original loader semantics and runs
        // before islands. Only the small selected loader is inlined, not Boomerang.
        injectScript("head-inline", bootstrap);
      },
    },
  };
}
