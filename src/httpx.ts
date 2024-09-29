/**
 * HTTPX
 * 
 * A minimal library leveraging the Fetch API for making HTTP requests.
 * 
 * Usage:
 * 
 * const httpx = require('./httpx');
 * 
 * const resp = await httpx({ url, method, data });
 * if (resp.ok) {
 *    const data = resp.data;
 * } else {
 *    const err = resp.error;
 * }
 * 
 * Returns an object with the following properties:
 * 
 * - data: The response data object.
 * - ok: A boolean indicating whether the request was successful.
 * - error: An optional error message if the request failed.
 */

interface RequestOptions {
  /** The URL to make the request to. */
  url: string;
  
  /** The HTTP method to use for the request (e.g., 'GET', 'POST'). */
  method: string;
  
  /** The data to send with the request (optional). */
  data?: string | object;
  
  /** Custom headers to include with the request (optional). */
  headers?: Record<string, string>;
  
  /** Query parameters to include in the request URL (optional). */
  query?: Record<string, string>;
}

/**
 * Checks if the body is an object and not an instance of FormData or a stream.
 * 
 * @param body - The body to check.
 * @returns True if the body is an object, otherwise false.
 */
const isObjectBody = (body: string | object): boolean => {
  return typeof body === "object" && !(body instanceof FormData) && !body.pipe;
};

/**
 * Builds a full URL with query parameters.
 * 
 * @param url - The base URL.
 * @param query - An object containing query parameters.
 * @param base - An optional base URL to resolve against.
 * @returns The full URL with query parameters appended.
 */
export const buildURL = (url: string, query: object, base: string | null = null): string => {
  let [path, urlQuery = ""] = url.split("?");

  // Merge global params with passed params and URL params
  const entries = new URLSearchParams({
    ...Object.fromEntries(new URLSearchParams(query)),
    ...Object.fromEntries(new URLSearchParams(urlQuery)),
  }).toString();

  if (entries) {
    path += "?" + entries;
  }

  if (!base) return path;
  
  const fullUrl = new URL(path, base);
  return fullUrl.href;
};

/**
 * Makes an HTTP request using the Fetch API.
 * 
 * @param options - The request options.
 * @param options.url - The URL to make the request to.
 * @param options.method - The HTTP method to use (e.g., 'GET', 'POST').
 * @param options.data - The data to send with the request (optional).
 * @param options.headers - Custom headers to include with the request (optional).
 * @param options.query - Query parameters to include in the request URL (optional).
 * @returns A promise that resolves to the response object, which includes data, ok status, and error if applicable.
 */
export default async function httpx(options: RequestOptions) {
  const url = options.query ? buildURL(options.url, options.query) : options.url;
  const request: RequestInit = {
    method: options.method || "GET",
    headers: {
      ...options.headers,
    },
  };

  if (options.data) {
    if (isObjectBody(options.data)) {
      request.body = JSON.stringify(options.data);
      request.headers["Content-Type"] = "application/json";
    } else {
      request.body = options.data;
    }
  }

  const res = await window.fetch(url, request);
  const type = res.headers.get("content-type");
  res.data = await (type && type.includes("application/json") ? res.json() : res.text());

  if (!res.ok) {
    res.error = `Error ${res.status}: ${res.statusText}`;
  }

  return res;
}
