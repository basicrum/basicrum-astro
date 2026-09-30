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
        // A shared preset and the site config can both add this integration.
        // Two registrations would let registration order pick the loader, so
        // refuse the configuration instead of guessing.
        const registrations = (config.integrations ?? [])
          .filter((integration) => integration && integration.name === "@basicrum/astro").length;
        if (registrations > 1) {
          throw new Error(
            `[basicrum] @basicrum/astro is registered ${registrations} times. Keep exactly one basicrum() entry ` +
            "in astro.config; check shared presets and the site configuration.",
          );
        }
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
