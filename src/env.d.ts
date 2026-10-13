// Vite resolves the vendored bundle's ?raw import when Astro builds the route.
declare module "*?raw" {
  const source: string;
  export default source;
}
