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
  collection?: string;
  options?: Record<string, unknown>;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
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
  assertSecureBaseUrl(clientOptions.baseUrl);

  const envelope: RequestEnvelope<TPayload> = { operation, payload };
  if (extras.collection) envelope.collection = extras.collection;
  if (extras.options) envelope.options = extras.options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": clientOptions.apiKey
  };
  if (extras.token) {
    headers.Authorization = `Bearer ${extras.token}`;
  }

  const fetchImpl = clientOptions.fetch ?? globalThis.fetch;
  const url = `${clientOptions.baseUrl.replace(/\/+$/, "")}/api/${clientOptions.urlAccessKey}`;

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
