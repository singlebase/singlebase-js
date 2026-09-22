import {
  RpcDispatcher,
  resolveClient,
  unregisterClient,
  type DispatchEnvelope,
  type DispatchOptions,
  type SinglebaseOptions
} from "@singlebase/core";
import { createAuthClient, type AuthClient, type AuthClientOptions } from "@singlebase/auth";
import type { UserProfile } from "@singlebase/auth";

export interface ServiceCallOptions extends DispatchOptions {
  /** Target collection, sent alongside `payload` in the RPC envelope. */
  collection?: string;
  /** Extra envelope options passed straight through. */
  options?: Record<string, unknown>;
}

/**
 * A service namespace. Any method name is valid and maps to the operation
 * `<namespace>.<method>`, so the client keeps working when the backend adds
 * operations without an SDK release:
 *
 * ```js
 * await sbc.data.insert({ name: "Ada" }, { collection: "users" });
 * // → { operation: "data.insert", collection: "users", payload: {...} }
 * ```
 *
 * `call()` is the explicit form for names that are not valid identifiers.
 */
export type ServiceNamespace = {
  call<TResult = unknown>(
    method: string,
    payload?: unknown,
    options?: ServiceCallOptions
  ): Promise<TResult>;
} & {
  // Intersection rather than one interface: `call` has a different shape
  // from the generic member signature, which an index signature would reject.
  [method: string]: (payload?: unknown, options?: ServiceCallOptions) => Promise<any>;
};

type DispatchFn = <TResult>(
  envelope: DispatchEnvelope,
  options?: DispatchOptions
) => Promise<TResult>;

function createService(namespace: string, dispatch: DispatchFn): ServiceNamespace {
  const call = <TResult = unknown>(
    method: string,
    payload?: unknown,
    options: ServiceCallOptions = {}
  ): Promise<TResult> => {
    const { collection, options: envelopeOptions, ...dispatchOptions } = options;
    return dispatch<TResult>(
      {
        operation: `${namespace}.${method}`,
        payload: payload ?? {},
        collection,
        options: envelopeOptions
      },
      dispatchOptions
    );
  };

  const target = { call } as unknown as ServiceNamespace;

  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      const own = obj as unknown as Record<string | symbol, unknown>;
      if (typeof prop === "symbol" || prop in own) return own[prop];
      return (payload?: unknown, options?: ServiceCallOptions) => call(prop, payload, options);
    }
  });
}

export type SinglebaseClientOptions = SinglebaseOptions &
  Omit<AuthClientOptions, keyof SinglebaseOptions>;

export interface SinglebaseClientInstance {
  /**
   * Authentication. Built on first access — a page that never touches it
   * pays nothing — and hydrated immediately once it is built.
   */
  readonly auth: AuthClient;
  /** The shared RPC pipe. Every service and auth use this one object. */
  readonly dispatcher: RpcDispatcher;

  readonly data: ServiceNamespace;
  readonly files: ServiceNamespace;
  readonly users: ServiceNamespace;
  readonly llm: ServiceNamespace;

  /** Namespace for any other service, e.g. `sbc.service("search").query({...})`. */
  service(namespace: string): ServiceNamespace;

  /**
   * Generic escape hatch. The bearer token is injected from the session
   * automatically; pass `bearer` to override, or `bearer: null` to send the
   * call unauthenticated.
   */
  dispatch<TResult = unknown, TPayload = unknown>(
    envelope: DispatchEnvelope<TPayload>,
    options?: DispatchOptions
  ): Promise<TResult>;

  isAuthenticated(): boolean;
  getUser(): UserProfile | null;

  /** Stops timers and drops the client from the page registry. */
  destroy(): void;
}

/**
 * Creates (or returns the existing) client for a project.
 *
 * ```js
 * const sbc = SinglebaseClient({ baseUrl, urlAccessKey, apiKey });
 *
 * await sbc.auth.signIn({ email, password });
 * await sbc.data.query({ limit: 10 }, { collection: "notes" });
 * await sbc.llm.summarize({ text });
 * ```
 *
 * Clients are cached by connection identity, so calling this anywhere on the
 * page returns the same object — one session, one refresh timer, one set of
 * tokens — and widgets with no `.client` bind to the page default.
 */
export function SinglebaseClient(options: SinglebaseClientOptions): SinglebaseClientInstance {
  return resolveClient(options, () => buildClient(options));
}

function buildClient(options: SinglebaseClientOptions): SinglebaseClientInstance {
  const dispatcher = new RpcDispatcher(options);

  // Lazy construction, eager hydration. Auth is only built when something
  // needs it — `.auth`, a widget, or a call that wants a bearer — but once
  // built, the dispatcher awaits its session restore before choosing a token
  // so a request fired on page load can't race ahead as anonymous.
  let authClient: AuthClient | null = null;
  function ensureAuth(): AuthClient {
    if (!authClient) {
      authClient = createAuthClient(options as AuthClientOptions, dispatcher);
    }
    return authClient;
  }

  dispatcher.setAuthProvider(async () => {
    const auth = ensureAuth();
    await auth.ready;
    return {
      getToken: () => (auth.isAuthenticated() ? (auth.getState() as any).session.id_token : null),
      refresh: async () => {
        try {
          return (await auth.refreshSession()).id_token;
        } catch {
          return null;
        }
      }
    };
  });

  const namespaces = new Map<string, ServiceNamespace>();
  const service = (namespace: string): ServiceNamespace => {
    let existing = namespaces.get(namespace);
    if (!existing) {
      existing = createService(namespace, (envelope, opts) => dispatcher.dispatch(envelope, opts));
      namespaces.set(namespace, existing);
    }
    return existing;
  };

  const client: SinglebaseClientInstance = {
    get auth() {
      return ensureAuth();
    },
    dispatcher,
    data: service("data"),
    files: service("files"),
    users: service("users"),
    llm: service("llm"),
    service,
    dispatch: (envelope, opts) => dispatcher.dispatch(envelope, opts),
    isAuthenticated: () => authClient?.isAuthenticated() ?? false,
    getUser: () => authClient?.getUser() ?? null,
    destroy() {
      authClient?.destroy();
      unregisterClient(client);
    }
  };

  return client;
}

/**
 * Auth-only convenience: `SinglebaseAuth(options)` is
 * `SinglebaseClient(options).auth`, for pages that never touch another
 * service. Both share the same cached client either way.
 */
export function SinglebaseAuth(options: SinglebaseClientOptions): AuthClient {
  return SinglebaseClient(options).auth;
}
