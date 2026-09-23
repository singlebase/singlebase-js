import type { AuthUIConfig } from "./authui-config.js";

/**
 * Shared transport types. Service-agnostic: every Singlebase service speaks
 * this envelope, so these live in core rather than in any one domain package.
 */

export type Audience = string;

export interface SinglebaseOptions {
  /**
   * The API root. Omit it to use `https://v1.singlebase.io/api`; it cannot be
   * null or empty.
   */
  baseUrl?: string;
  /** The project's URL access key. Optional; when set it is appended to `baseUrl`. */
  urlAccessKey?: string;
  apiKey: string;
  audience?: Audience;
  fetch?: typeof globalThis.fetch;
  /**
   * Page-wide defaults for the singlebase-authui elements. Configuring them
   * here means one call styles every widget; an attribute on an individual
   * element still wins.
   */
  authui?: AuthUIConfig;
}

export interface RequestEnvelope<TPayload = unknown> {
  operation: string;
  payload: TPayload;
  options?: Record<string, unknown>;
}

export interface SuccessResponse<TData = unknown> {
  data: TData;
  meta: Record<string, unknown>;
  exec_time: number;
}

export interface ErrorResponsePayload {
  type: string;
  status: number;
  message: string;
  details?: unknown;
  trace_id?: string | null;
}

export interface ErrorResponse {
  error: ErrorResponsePayload;
  meta: Record<string, unknown>;
  exec_time: number;
}

export type TransportResponse<TData = unknown> = SuccessResponse<TData> | ErrorResponse;

/**
 * Generic persistence for whatever a domain package needs to keep between
 * page loads. Auth stores its session here; the adapters in storage.ts know
 * nothing about what is inside.
 */
export interface SinglebaseStorage<T = unknown> {
  get(): Promise<T | null> | T | null;
  set(value: T): Promise<void> | void;
  clear(): Promise<void> | void;
}
