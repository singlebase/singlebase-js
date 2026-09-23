import type { SinglebaseOptions } from "./types.js";
import { DEFAULT_BASE_URL } from "./transport.js";

/**
 * Client registry.
 *
 * A page can hold several widgets — a header sign-in, a modal, an account
 * panel — and they must all share one client: one session, one refresh
 * timer, one set of tokens. A client per widget would mean several session
 * stores and several refresh loops racing for the single-use refresh token.
 *
 * The registry lives on `globalThis` under a well-known symbol rather than in
 * module scope, because bundles duplicate modules: a page that loads the
 * widget bundle *and* imports the SDK has two copies of this file, and a
 * module-scoped `let` would give each its own "default" — so widgets would
 * silently never see the client the app created. Keying off globalThis makes
 * every copy, and every independently loaded script, agree.
 */
const REGISTRY = Symbol.for("singlebase.client.registry");

interface Registry<T> {
  instances: Map<string, T>;
  default: T | null;
}

function registry<T>(): Registry<T> {
  const host = globalThis as unknown as Record<symbol, Registry<T> | undefined>;
  let existing = host[REGISTRY];
  if (!existing) {
    existing = { instances: new Map(), default: null };
    host[REGISTRY] = existing;
  }
  return existing;
}

/** Connection identity — clients with the same one are the same instance. */
export function clientKey(options: SinglebaseOptions): string {
  return [
    options.baseUrl ?? DEFAULT_BASE_URL,
    options.urlAccessKey ?? "",
    options.apiKey ?? "",
    options.audience ?? "web"
  ].join("|");
}

/** Returns the cached client for these options, or creates and caches one. */
export function resolveClient<T>(options: SinglebaseOptions, create: () => T): T {
  const reg = registry<T>();
  const key = clientKey(options);
  const existing = reg.instances.get(key);
  if (existing) return existing;

  const client = create();
  reg.instances.set(key, client);
  if (!reg.default) reg.default = client;
  return client;
}

/** The client widgets fall back to when none is set on them. */
export function getDefaultClient<T = unknown>(): T | null {
  return registry<T>().default;
}

/** Overrides the page default (useful when several projects are in play). */
export function setDefaultClient<T>(client: T | null): void {
  registry<T>().default = client;
}

/** Drops a client from the registry. */
export function unregisterClient<T>(client: T): void {
  const reg = registry<T>();
  for (const [key, value] of reg.instances) {
    if (value === client) reg.instances.delete(key);
  }
  if (reg.default === client) {
    reg.default = reg.instances.values().next().value ?? null;
  }
}
