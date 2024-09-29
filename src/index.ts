/**
 * =====================
 *       Singlebase
 * =====================
 *
 * ** Initialization **
 * 
 * import CreateClient from 'singlebase-js'
 * 
 * const client = CreateClient({api_url:str, api_key:str})
 * 
 * 
 * ** Services **
 * - useAuth()
 * - useDatastore()
 * - useFilestore()
 * - useLLM() 
 *
 * ** Features **
 * - Dispatch Requests
 * - Authentication
 * - File Storage
 * - Data Storage
 * - Initialize Auth UI
 * - LLM access
 * 
 */

import AuthClient from './AuthClient';
import Filestore from './Filestore';
import Datastore from './Datastore';
import LLM from './LLM';

import {
  SinglebaseResponseType,
  DispatchOptions,
  SinglebaseOptions
} from './types';
import httpx from './httpx';
import { isPlainObject, isFn } from './lib';

const DEFAULT_API_URL = 'https://cloud.singlebaseapis.com/api';
const SBCUI_SYMBOL_KEY = 'singlebaseui';


// Define the return type for createClient
interface SinglebaseClient {
  dispatch: (
    payload: Record<string, any>,
    options?: DispatchOptions
  ) => Promise<SinglebaseResponseType>;
  useTransformRequest: (
    callback: (data: any, headers: Record<string, any>) => any
  ) => void;
  useAuth: () => ReturnType<typeof AuthClient>;
  useFilestore: () => ReturnType<typeof Filestore>;
  useDatastore: () => ReturnType<typeof Datastore>;
  useLLM: () => ReturnType<typeof LLM>;
  initAuthUI: (authUIConfig?: Record<string, any>) => void;
}

/**
 * Makes an AJAX request.
 *
 * @param url - The endpoint URL.
 * @param payload - The request payload.
 * @param dispatchOptions - Options for dispatching the request.
 * @returns The response from the server.
 * @throws If the payload is missing required fields.
 */
async function makeRequest(
  url: string,
  payload: Record<string, any> = {},
  dispatchOptions: DispatchOptions = {}
): Promise<SinglebaseResponseType> {

  if (!payload.action && !payload.query) {
    throw new Error(
      `Singlebase request payload missing 'action' or 'query'. URL: ${url}, Payload: ${JSON.stringify(payload)}`
    );
  }

  // Prepare headers with support for dynamic values
  const headers: Record<string, any> = { ...dispatchOptions.headers };
  for (const [key, value] of Object.entries(headers)) {
    const _val = isFn(value) ? await value(payload) : value
    if (_val) {
      headers[key] = _val
    }
  }

  // Transform request data if a transform function is provided
  const data = dispatchOptions.transformRequest
    ? await dispatchOptions.transformRequest(payload, headers)
    : payload;

  try {
    const response = await httpx({
      url,
      method: 'POST',
      headers,
      data,
    });

    return {
      ok: response?.data?.ok ?? response.ok ?? false,
      data: response?.data?.data ?? null,
      meta: response?.data?.meta ?? null,
      error: response?.data?.error ?? null,
      xhr: response,
      exception: null,
    };

  } catch (error) {
    console.error(`Request to ${url} failed:`, error);
    return {
      ok: false,
      data: null,
      meta: null,
      error: (error as Error).message || 'An unknown error occurred',
      xhr: null,
      exception: error,
    };
  }
};

/**
 * Creates a dispatch function for a specific URL.
 *
 * @param url - The endpoint URL.
 * @param defaultOptions - Default dispatch options.
 * @returns A function to dispatch requests to the given URL.
 */
const createDispatcher = (
  url: string,
  defaultOptions: DispatchOptions = {}
) => {
  return async (
    payload: Record<string, any> = {},
    options: DispatchOptions = {}
  ): Promise<SinglebaseResponseType> => {
    const combinedOptions: DispatchOptions = { ...defaultOptions, ...options };
    return makeRequest(url, payload, combinedOptions);
  };
};

/**
 * Initializes the Singlebase client.
 *
 * @param config - Configuration options.
 * @param config.api_url - The base URL for requests.
 * @param config.api_key - The API key for authentication.
 * @param config.options - Additional options for dispatching.
 * @param config.authStorageKey - Key for storing authentication tokens.
 * @returns An object containing dispatch and service hooks.
 * 
 * example 
 * 
 * import createClient from 'singlebase-js'
 * const singlebase = createClient({api_key, api_url})
 * 
 * const auth = singlebase.useAuth() 
 * const datastore = singlebase.useDatastore() 
 * const filestore = singlebase.useFilestore()
 * const llm = singlebase.useLLM() 
 * 
 * -- initiate AuthUI
 * 
 * singlebase.initAuthUI(config:{})
 * 
 */
const createClient = ({
  api_url = DEFAULT_API_URL,
  api_key,
  options = {},
  authStorageKey = null,
}: SinglebaseOptions): SinglebaseClient => {
  if (!api_key) {
    throw new Error('API key is required for Singlebase initialization.');
  }

  // Hold a singleton
  const clients = {
    auth: null as ReturnType<typeof AuthClient> | null,
    filestore: null as ReturnType<typeof Filestore> | null,
    datastore: null as ReturnType<typeof Datastore> | null,
    llm: null as ReturnType<typeof LLM> | null,
  };

  // Merge headers, giving precedence to default headers
  const headers: Record<string, any> = {
    
    // X-API-KEY
    'x-api-key': api_key,

    // AUTHORIZATION BEARER 
    'Authorization': async () => {
      // only set when auth has been initialized
      if (clients?.auth !== null) {
        //const idToken = await getAuth().getIdToken()
        const idToken = getAuth()?.idToken
        if (idToken) {
          return `Bearer ${idToken}`
        }
        return null 
      }
    },
    ...(isPlainObject(options.headers) ? options.headers : {}),
  };

  // Extract transformRequest if provided
  const { transformRequest, ...restOptions } = options;

  const dispatchOptions: DispatchOptions = {
    ...restOptions,
    headers,
    transformRequest,
  };

  // Initialize dispatch
  const dispatch = createDispatcher(api_url, dispatchOptions);

  /**
   * Lazily initializes and retrieves the Auth client.
   *
   * @returns The Auth client instance.
   */
  const getAuth = (): ReturnType<typeof AuthClient> => {
    if (!clients.auth) {
      clients.auth = AuthClient(dispatch, authStorageKey);
    }
    return clients.auth;
  };

  /**
   * Initializes the Authentication UI and stores it in the window using a Symbol key.
   * @param authUIConfig - Configuration for the authentication UI.
   */
  const initAuthUI = (authUIConfig: Record<string, any> = {}) => {
    const authUISymbol = Symbol.for(SBCUI_SYMBOL_KEY);
    if (!(window as any)[authUISymbol]) {
      (window as any)[authUISymbol] = {
        auth: getAuth(),
        authUIConfig,
      };
    }
  };

  return {
    /**
     * Dispatch function to make requests.
     *
     * @param payload - The request payload.
     * @param options - Additional dispatch options.
     * @returns The response from the server.
     */
    dispatch,

    /**
     * Sets a custom transformRequest function.
     *
     * @param callback - The transform function.
     */
    useTransformRequest: (
      callback: (data: any, headers: Record<string, any>) => any
    ) => {
      dispatchOptions.transformRequest = callback;
    },

    /**
     * Access authentication functionalities.
     *
     * @returns The authentication client.
     */
    useAuth: getAuth,

    /**
     * Access file storage functionalities.
     *
     * @returns The file storage client.
     */
    useFilestore: (): ReturnType<typeof Filestore> => {
      if (!clients.filestore) {
        clients.filestore = new Filestore(dispatch);
      }
      return clients.filestore;
    },

    /**
     * Access datastore functionalities.
     *
     * @returns The datastore client.
     */
    useDatastore: (): ReturnType<typeof Datastore> => {
      if (!clients.datastore) {
        clients.datastore = new Datastore(dispatch);
      }
      return clients.datastore;
    },

    /**
     * Access LLM functionalities.
     *
     * @returns The LLM client.
     */
    useLLM: (): ReturnType<typeof LLM> => {
      if (!clients.llm) {
        clients.llm = new LLM(dispatch);
      }
      return clients.llm;
    },

    /**
     * Initializes the authentication UI.
     */
    initAuthUI,
  };
};

export default createClient;
