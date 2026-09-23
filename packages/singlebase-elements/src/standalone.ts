/**
 * Entry point for the self-contained `<script type="module">` build.
 *
 * On top of registering every element it does two things the npm entry point
 * deliberately does not:
 *
 *  1. exposes the SDK on `window.Singlebase`, so a page with no bundler can
 *     still reach `Singlebase.SinglebaseClient(...)`;
 *  2. reads configuration off its own <script> tag, so the common case —
 *     "drop in a tag, show a sign-in box" — needs no JavaScript at all.
 *
 * Only the `wk_`-prefixed web key ever belongs in these attributes. They are
 * public page source; a root, server or agent key must never appear here.
 */
import { SinglebaseClient, type SinglebaseClientOptions } from "@singlebase/singlebase-sdk";

export * from "./index.js";
export { SinglebaseClient, SinglebaseAuth } from "@singlebase/singlebase-sdk";

function autoConfig(): SinglebaseClientOptions | null {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>(
      "script[data-singlebase-api-key], script[data-singlebase-url-access-key], script[data-singlebase-base-url]"
    );
  if (!script) return null;

  const { baseUrl, singlebaseUrlAccessKey, singlebaseApiKey, singlebaseBaseUrl } =
    script.dataset as Record<string, string | undefined>;

  // Every connection option is optional, so a tag configures a client when it
  // carries at least one of them. A bare tag is a plain library load: creating
  // a client then would claim the page default before the app's own call.
  const base = singlebaseBaseUrl ?? baseUrl;
  if (!singlebaseApiKey && !singlebaseUrlAccessKey && !base) return null;

  // Only what the tag actually sets: the SDK supplies the default base URL.
  const config: SinglebaseClientOptions = {};
  if (base) config.baseUrl = base;
  if (singlebaseUrlAccessKey) config.urlAccessKey = singlebaseUrlAccessKey;
  if (singlebaseApiKey) config.apiKey = singlebaseApiKey;
  return config;
}

if (typeof document !== "undefined") {
  const config = autoConfig();
  if (config) {
    try {
      // Constructing the client registers it as the page default, which is
      // what lets a bare <singlebase-authui> find a session.
      SinglebaseClient(config);
    } catch (error) {
      console.error("[singlebase] auto-configuration failed:", error);
    }
  }

  const globalScope = globalThis as unknown as Record<string, unknown>;
  globalScope.Singlebase = {
    ...(globalScope.Singlebase as Record<string, unknown> | undefined),
    SinglebaseClient
  };
}
