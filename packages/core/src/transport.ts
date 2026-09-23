import { SinglebaseError } from "./errors.js";
import type {
  SinglebaseOptions,
  ErrorResponse,
  RequestEnvelope,
  SuccessResponse
} from "./types.js";

export interface RequestExtras {
  token?: string | null;
  signal?: AbortSignal;
  options?: Record<string, unknown>;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

/** Where requests go when `baseUrl` is not given. */
export const DEFAULT_BASE_URL = "https://v1.singlebase.io/api";

/**
 * The effective API root: the default when `baseUrl` is omitted. An explicit
 * null or empty value is a configuration mistake, and is reported as one
 * rather than silently replaced.
 */
export function resolveBaseUrl(options: Pick<SinglebaseOptions, "baseUrl">): string {
  if (options.baseUrl === undefined) return DEFAULT_BASE_URL;
  if (options.baseUrl === null || String(options.baseUrl).trim() === "") {
    throw new Error(
      `SinglebaseOptions.baseUrl cannot be null or empty. Omit it to use ${DEFAULT_BASE_URL}.`
    );
  }
  return String(options.baseUrl).trim().replace(/\/+$/, "");
}

/**
 * The URL every request is POSTed to: `{baseUrl}/{urlAccessKey}`, or just
 * `{baseUrl}` when there is no access key.
 */
export function endpointFor(options: Pick<SinglebaseOptions, "baseUrl" | "urlAccessKey">): string {
  const base = resolveBaseUrl(options);
  assertSecureBaseUrl(base);
  const key = options.urlAccessKey?.trim();
  return key ? `${base}/${encodeURIComponent(key)}` : base;
}

/** Enforces the spec's HTTPS-outside-localhost rule for the configured baseUrl. */
export function assertSecureBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`SinglebaseOptions.baseUrl is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol !== "https:" && !isLocalHost(url.hostname)) {
    throw new Error(
      `SinglebaseOptions.baseUrl must use HTTPS outside of localhost/127.0.0.1/0.0.0.0 (got ${url.protocol})`
    );
  }
}

/**
 * Low-level RPC request. Returns the parsed `data` on success and throws
 * `SinglebaseError` on a well-formed error response or a network/transport
 * failure. Never leaks tokens into thrown error objects, logs, or URLs.
 */
export async function request<TData = unknown, TPayload = unknown>(
  clientOptions: SinglebaseOptions,
  operation: string,
  payload: TPayload,
  extras: RequestExtras = {}
): Promise<TData> {
  const url = endpointFor(clientOptions);

  const envelope: RequestEnvelope<TPayload> = { operation, payload };
  if (extras.options) envelope.options = extras.options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientOptions.apiKey) headers["X-API-Key"] = clientOptions.apiKey;
  if (extras.token) {
    headers.Authorization = `Bearer ${extras.token}`;
  }

  const fetchImpl = clientOptions.fetch ?? globalThis.fetch;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(envelope),
      signal: extras.signal
    });
  } catch (cause) {
    throw SinglebaseError.fromNetworkError(cause);
  }

  let json: SuccessResponse<TData> | ErrorResponse;
  try {
    json = await res.json();
  } catch (cause) {
    throw SinglebaseError.fromNetworkError(cause);
  }

  if ("error" in json) {
    throw new SinglebaseError(json.error);
  }
  return json.data;
}
