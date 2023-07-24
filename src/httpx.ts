/**
 * 
 */

import { isPlainObject } from './utils'

function buildURL(url, query, base=null) {
  let [path, urlQuery = {}] = url.split("?");

  // Merge global params with passed params with url params
  const entries = new URLSearchParams({
    ...Object.fromEntries(new URLSearchParams(query)),
    ...Object.fromEntries(new URLSearchParams(urlQuery)),
  }).toString();
  if (entries) {
    path = path + "?" + entries;
  }

  if (!base) return path;
  const fullUrl = new URL(path, base);
  return fullUrl.href;
};

export default async function httpx(options) {
  let url = options?.query ? buildURL(options?.url, options?.query) : options?.url;
  const request = {
    method: options?.method || "GET",
    headers: {
      ...(options?.headers || {})
    },
  }

  if (options.data) {
    if (isPlainObject(options.data)) {
      request.body = JSON.stringify(options.data);
      request.headers["Content-Type"] = "application/json"
    } else  {
      request.body = options.data
    }
  }

  const res = await window.fetch(url, request);
  const type = res?.headers?.get("content-type");
  res.data = (await ((type && type?.includes("application/json")) ? res.json() : res.text()));
  return res
}


