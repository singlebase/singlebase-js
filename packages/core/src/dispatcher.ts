import { SinglebaseError } from "./errors.js";
import { request } from "./transport.js";
import type { SinglebaseOptions } from "./types.js";

/** Server error codes that mean "your bearer token is stale, try refreshing". */
const RETRYABLE_AUTH_CODES = new Set(["INVALID_ID_TOKEN", "INVALID_BEARER_TOKEN"]);

export interface DispatchEnvelope<TPayload = unknown> {
  operation: string;
  payload?: TPayload;
  collection?: string;
  options?: Record<string, unknown>;
}

export interface DispatchOptions {
  /**
   * Explicit bearer token. Omit to let the dispatcher inject the current
   * session's ID token; pass `null` to force an unauthenticated call.
   */
  bearer?: string | null;
  signal?: AbortSignal;
}

export interface DispatcherAuthBridge {
  /** Current ID token, or null when signed out. */
  getToken(): string | null;
  /** Refresh once and return the new ID token, or null if unrecoverable. */
  refresh(): Promise<string | null>;
}

/**
 * Supplies the auth bridge on demand. Returning a promise lets auth be
 * *constructed lazily* — a page that never signs in pays nothing — while
 * still being *hydrated eagerly* before the first call that could carry a
 * token. Without this, a `data.query()` fired on page load would race the
 * session restore and silently go out unauthenticated.
 */
export type AuthBridgeProvider = () => Promise<DispatcherAuthBridge | null>;

/**
 * One RPC pipe shared by every Singlebase service.
 *
 * Auth and every service client go through this, so there is a single place
 * that knows the envelope shape, the endpoint, how a bearer is attached, and
 * how a stale token is recovered.
 */
export class RpcDispatcher {
  private bridge: DispatcherAuthBridge | null = null;
  private provider: AuthBridgeProvider | null = null;

  constructor(readonly options: SinglebaseOptions) {}

  /** Registers the session owner (the auth client) as the token source. */
  setAuthBridge(bridge: DispatcherAuthBridge | null): void {
    this.bridge = bridge;
  }

  /** Registers a factory that builds+hydrates the token source on first need. */
  setAuthProvider(provider: AuthBridgeProvider | null): void {
    this.provider = provider;
  }

  private async resolveBridge(): Promise<DispatcherAuthBridge | null> {
    if (this.bridge) return this.bridge;
    if (!this.provider) return null;
    this.bridge = await this.provider();
    return this.bridge;
  }

  /**
   * Sends one operation. Injects the session bearer unless told otherwise,
   * and on a stale-token error refreshes once and retries the call exactly
   * once — never looping.
   */
  async dispatch<TResult = unknown, TPayload = unknown>(
    envelope: DispatchEnvelope<TPayload>,
    { bearer, signal }: DispatchOptions = {}
  ): Promise<TResult> {
    const explicit = bearer !== undefined;
    const bridge = explicit ? null : await this.resolveBridge();
    const token = explicit ? bearer : (bridge?.getToken() ?? null);

    const extras = {
      token,
      signal,
      collection: envelope.collection,
      options: envelope.options
    };

    try {
      return await request<TResult, TPayload>(
        this.options,
        envelope.operation,
        (envelope.payload ?? {}) as TPayload,
        extras
      );
    } catch (error) {
      const code = error instanceof SinglebaseError ? error.code : "";
      const canRetry =
        !explicit && token !== null && bridge !== null && RETRYABLE_AUTH_CODES.has(code);
      if (!canRetry) throw error;

      const refreshed = await bridge!.refresh();
      if (!refreshed) throw error;

      return request<TResult, TPayload>(
        this.options,
        envelope.operation,
        (envelope.payload ?? {}) as TPayload,
        { ...extras, token: refreshed }
      );
    }
  }
}
