// Astro route serving the self-hosted Boomerang bundle.
// The ?raw import must name the same file as BOOMERANG_BUNDLE_PATH in
// src/core/assets.js; a unit test checks that the two stay in sync.
import boomerang from "../vendor/boomerang/boomerang-1.815.60.cutting-edge.min.js?raw";

// Emitted as a static asset even in a server-rendered Astro deployment.
export const prerender = true;

export function GET() {
  return new Response(boomerang, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
