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
import { isPlainObject, isFn, isEmpty } from './lib';

const DEFAULT_API_URL = 'https://cloud.singlebaseapis.com/api';
const DEFAULT_AUTHUI_JS_PATH = "https://cdn.jsdelivr.net/npm/@singlebase/singlebase-authui[[VERSION]]/dist/index.js"
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

type JsLibOptions = {
  url?: string;
  module?: boolean;
  version?: string;
};

type AuthUILibType = boolean | JsLibOptions;

type AuthUIConfigType = Record<string, any>;

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

  // set Headers Authorization
  await dispatchOptions?.setHeadersAuthorizationBearer?.(headers)

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
 * Load a script
 * @param url 
 * @param options 
 * @returns 
 */
function loadScript(url: string, options?: { module?: boolean; async?: boolean; defer?: boolean }): void {
  
  // Check if the script is already loaded
  if (document.querySelector(`script[src="${url}"]`)) {
      console.log(`Script ${url} is already loaded.`);
      return; // Exit if the script is already present
  }

  // Set default options
  const defaultOptions = { module: true, defer: true, async: false };

  const _options = { ...defaultOptions, ...options };

  // Ensure only one of async or defer is true
  if (_options.async && _options.defer) {
      console.warn('Both async and defer cannot be true. Defaulting to defer.');
      _options.async = false; // Default to defer if both are true
  }
  const script = document.createElement('script');
  script.src = url;
  if (_options.module) {
      script.type = 'module';
  }
  if (_options.async) {
      script.async = true;
  }
  if (_options.defer) {
      script.defer = true; 
  }
  // Append the script to the document head or body
  document.head.appendChild(script);
}

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
    // x-api-key
    'x-api-key': api_key,

    // x-sbc-sdk-client
    'x-sbc-sdk-client': `singlebase-js@__VERSION__`,

    // authorization 
    'Authorization': '',

    ...(isPlainObject(options.headers) ? options.headers : {}),
  };

  /**
   * Set the authorization headers
   * @param headers 
   */
  const setHeadersAuthorizationBearer = async (headers) => {
    if (clients?.auth) {
      const idToken = await getAuth().getIdToken()
      headers['Authorization'] = idToken ? `Bearer ${idToken}` : ''
    } else {
      headers['Authorization'] = ''
    }
  }

  // Extract transformRequest if provided
  const { transformRequest, ...restOptions } = options;


  const dispatchOptions: DispatchOptions = {
    ...restOptions,
    headers,
    transformRequest,
    setHeadersAuthorizationBearer
  };

  // Initialize dispatch
  const dispatch = createDispatcher(api_url, dispatchOptions);

  const useFilestore = (): ReturnType<typeof Filestore> => {
    if (!clients.filestore) {
      clients.filestore = new Filestore(dispatch);
    }
    return clients.filestore;
  }

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
     * Also load the AuthUI library that contains the
     * @param authUIConfig - Configuration for the authentication UI.
     * @param authUILib - To load the AuthUI library, to use the tag. By default it's false.
     */
    const initAuthUI = (authUIConfig: AuthUIConfigType = {}, authUILib: AuthUILibType = false) => {
      const authUISymbol = Symbol.for(SBCUI_SYMBOL_KEY);
      if (!(window as any)[authUISymbol]) {

          // add config un the symbol
          (window as any)[authUISymbol] = {
            auth: getAuth(),
            useFilestore,
            authUIConfig,
          };

          // Load the JS
          if (authUILib === true || (isPlainObject(authUILib) && !isEmpty(authUILib))) {
              const _libVersion = authUILib?.version ?? 'latest';
              const _libModule =  authUILib?.module !== false;
              const _url = authUILib?.url ?? DEFAULT_AUTHUI_JS_PATH.replace("[[VERSION]]", `@${_libVersion}`);
              loadScript(_url, { module: _libModule });
          }
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
    useFilestore,

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
