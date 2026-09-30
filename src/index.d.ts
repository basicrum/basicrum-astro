import type { AstroIntegration } from "astro";
import type { BasicrumOptions } from "./core/index.js";

export type { BasicrumOptions, LoaderMode } from "./core/index.js";

export default function basicrum(options: BasicrumOptions): AstroIntegration;
