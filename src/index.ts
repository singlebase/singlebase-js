import httpx from './httpx'
import CollectionService from './collection'
import AuthService from './auth'
import StorageService from './storage'

import { ResponseType } from './types';
import { isPlainObject, removeTrailingSlash } from './utils';


/**
 * Makes the ajax request
 * @param {String} url
 * @param {Object} payload
 * @param {Object|null} dispatchOptions {headers, transformRequest }
 * @returns {Promise<ResponseType>}
 */

async function request(url:string, payload:object={}, dispatchOptions:object|null=null): Promise<ResponseType> {
  
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


export default (api_url:string, access_key:string, options:object={}) => {

  async function dispatch(payload:object, opts:object) {

    const _opts = {
      ...(isPlainObject(opts) ? {...opts} : {}),
      ...options
    }

    let headers = { 
      "X-SINGLEBASE-ACCESS-KEY": access_key 
    }

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

    return await request(api_url, payload, dispatchOptions)
  }

  return {
    dispatch,
    collection: (collectionName:string) => new CollectionService(dispatch, collectionName),
    auth: new AuthService(dispatch),
    storage: new StorageService(dispatch)
  }
}

