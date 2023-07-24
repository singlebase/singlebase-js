import httpx from './httpx'
import { CollectionService, AuthService, StorageService } from './services';
import { isPlainObject } from './utils';

/**
 * Makes the ajax request
 * @param {String} url
 * @param {Object} payload
 * @param {Object} dispatchOptions {headers, transformRequest }
 * @returns {Promise {ok, data, error, meta, xhr, exception}}
 */

async function request(url, payload={}, dispatchOptions=null) {
  
  if (!payload.action && !payload.query) {
    throw new Error("Singlebase request payload missing 'action' or 'query'", url, payload);
  }

  // Headers is k/v object. v can also be a function to be executed
  // ie, the function can be to fetch the Authorization Bearer
  const reqHeaders = {};
  if (dispatchOptions.headers) {
    for (const h of Object.keys(dispatchOptions.headers)) {
      reqHeaders[h] = dispatchOptions.headers[h] instanceof Function ? await dispatchOptions.headers[h](payload) : dispatchOptions.headers[h];
    }
  }

  const data = dispatchOptions.transformRequest ? await dispatchOptions.transformRequest(payload, reqHeaders) : payload

  try {
    const resp = await httpx({
      url,
      method: 'POST',
      headers: reqHeaders,
      data: data,
    });
    return {
      ok: resp?.data?.ok || resp?.ok,
      data: resp?.data?.data,
      meta: resp?.data?.meta,
      error: resp?.data?.error,
      xhr: resp,
      exception: null,
    };
  } catch (e) {
    return {
      ok: false,
      data: null,
      meta: null,
      error: null,
      xhr: null,
      exception: e
    }
  }
};


export default (url, access_key, options={}) => {

  async function dispatch(payload, opts) {
    console.log("DISPATCHER", url, access_key, options)
    const _opts = {
      ...(isPlainObject(opts) ? {...opts} : {}),
      ...options
    }

    let headers = { "X-SINGLEBASE-ACCESS-KEY": access_key }

    if (_opts?.headers && isPlainObject(_opts?.headers)) {
      headers = {
        ...opts?.headers,
        ...headers
      }
      delete _opts.headers;
    }
    const dispatchOptions = {
      ...opts,
      headers,
    }
    return await request(url, payload, dispatchOptions)
  }

  return {
    dispatch,
    collection: (collectionName:string) => CollectionService(dispatch, collectionName),
    auth: AuthService(dispatch),
    storage: StorageService(dispatch)

  }
}

