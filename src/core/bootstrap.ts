import type { NormalizedOptions } from "./options.js";

interface ConsentPlugin {
  init(): this;
  is_complete(): boolean;
}

interface WaitAfterOnloadPlugin extends ConsentPlugin {
  complete: boolean;
  started: boolean;
  sent: boolean;
  timer: number | null;
}

// The loader starts with a stub. The bundle provides these methods before
// draining the queue or initializing our plugins. Keep those calls inside
// callbacks: none of the runtime methods exist during configure().
interface Boomerang {
  version?: string;
  snippetExecuted?: boolean;
  url?: string;
  plugins: {
    BasicrumConsent?: ConsentPlugin;
    WaitAfterOnload?: WaitAfterOnloadPlugin;
  };
  addVar(name: string, value: string): unknown;
  subscribe(event: string, callback: () => void): unknown;
  sendBeacon(): unknown;
  real_sendBeacon(): unknown;
}

interface BoomerangConfig {
  beacon_url: string;
  instrument_xhr: boolean;
  strip_query_string: boolean;
  Continuity: { enabled: boolean };
  ResourceTiming: { enabled: boolean; splitAtPath: boolean };
  secure_cookie: boolean;
  same_site_cookie: string;
}

type BoomerangCommand =
  | ["addVar", Record<string, string>]
  | ["subscribe", string, () => void];

interface BootstrapWindow extends Window {
  __basicrumInitialized?: boolean;
  BOOMR?: Partial<Boomerang>;
  BOOMR_mq?: BoomerangCommand[];
  basicRumBoomerangConfig?: BoomerangConfig;
}

/**
 * This function is serialized into a classic browser script, never run on the
 * server. Keep it free of syntax the oldest supported browsers cannot parse.
 * Type annotations are erased by tsc; no runtime imports or helpers may be
 * referenced here because configure.toString() must remain self-contained.
 */
function configure(options: NormalizedOptions, boomerangUrl: string, generator: string): boolean {
  var w = window as BootstrapWindow;
  // Frameworks with client-side routing can evaluate head scripts again on
  // navigation. In particular, never restore a configuration cleared by
  // consent withdrawal.
  if (w.__basicrumInitialized ||
      (w.BOOMR && (w.BOOMR.version || w.BOOMR.snippetExecuted))) {
    return false;
  }
  w.__basicrumInitialized = true;
  w.BOOMR = w.BOOMR || {};
  w.BOOMR.plugins = w.BOOMR.plugins || {};
  w.BOOMR.url = boomerangUrl;
  w.BOOMR_mq = w.BOOMR_mq || [];
  w.BOOMR_mq.push(["addVar", {
    brum_site_id: options.brumSiteId,
    p_gen: generator,
    p_type: options.pageType,
  }]);

  // Read metadata at beacon time: the bootstrap is injected before the
  // layout's head content has necessarily been parsed.
  w.BOOMR_mq.push(["subscribe", "before_beacon", function () {
    var meta = document.querySelector<HTMLMetaElement>('meta[name="basicrum:page-type"]');
    w.BOOMR!.addVar!("p_type", (meta && meta.content) || options.pageType);
  }]);

  // Consent is also enforced at Boomerang's final send boundary: every send
  // passes the plugins' is_complete checks first, so a send queued before a
  // withdrawal is dropped once the consent loader has cleared the
  // configuration. The non-consent loader never clears it.
  w.BOOMR.plugins.BasicrumConsent = {
    init: function () { return this; },
    is_complete: function () { return Boolean(w.basicRumBoomerangConfig); },
  };

  w.basicRumBoomerangConfig = {
    beacon_url: options.beaconEndpoint,
    instrument_xhr: false,
    strip_query_string: options.stripQueryString,
    Continuity: { enabled: options.continuity },
    ResourceTiming: { enabled: options.resourceTiming, splitAtPath: true },
    secure_cookie: true,
    same_site_cookie: "Strict",
  };

  if (options.waitAfterOnloadMs > 0) {
    // While this plugin is incomplete Boomerang holds every beacon back, so a
    // visitor leaving during the delay must not lose the measurement.
    w.BOOMR.plugins.WaitAfterOnload = {
      complete: false,
      started: false,
      sent: false,
      timer: null,
      init: function () {
        var plugin = this;
        function finish() {
          plugin.complete = true;
          if (plugin.timer) {
            w.clearTimeout(plugin.timer);
            plugin.timer = null;
          }
        }
        function start() {
          if (plugin.started) return;
          plugin.started = true;
          plugin.timer = w.setTimeout(function () {
            if (plugin.complete) return;
            finish();
            if (w.basicRumBoomerangConfig) w.BOOMR!.sendBeacon!();
          }, options.waitAfterOnloadMs);
        }
        if (document.readyState === "complete") start();
        else w.addEventListener("load", start, { once: true });
        // Boomerang reports each transmitted beacon here. Until then the first
        // beacon is still pending, even after the timer has queued it.
        w.BOOMR!.subscribe!("beacon", function () { plugin.sent = true; });
        // This plugin is registered before the bundle's own plugins, so its
        // unload handler runs before RT adds the unload fields. Send the
        // pending first beacon now; a queued send would never run during
        // unload, so send synchronously. A withdrawal cleared the
        // configuration, in which case nothing is pending.
        w.BOOMR!.subscribe!("page_unload", function () {
          var pending = plugin.started && !plugin.sent && Boolean(w.basicRumBoomerangConfig);
          finish();
          if (pending) {
            w.BOOMR!.sendBeacon!();
            w.BOOMR!.real_sendBeacon!();
          }
        });
        return this;
      },
      is_complete: function () { return this.complete; },
    };
  }
  return true;
}

/** Safely embed configuration in an HTML script element. */
export function serialize(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

interface BootstrapInput {
  settings: NormalizedOptions;
  boomerangUrl: string;
  loaderSource: string;
  /** Reported as p_gen; identifies the adapter. */
  generator: string;
}

/** Build the inline classic head script: configuration followed by the loader. */
export function createBootstrap({ settings, boomerangUrl, loaderSource, generator }: BootstrapInput): string {
  if (typeof generator !== "string" || !generator.trim()) {
    throw new TypeError("[basicrum] A generator name is required.");
  }
  return `;(function () {\n${configure.toString()}\n` +
    `if (!configure(${serialize(settings)}, ${serialize(boomerangUrl)}, ${serialize(generator)})) return;\n` +
    `${loaderSource}\n})();`;
}
