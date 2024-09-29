
import { AuthResultInterface } from './types';


export const isPlainObject = (value) => typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
export const isString = (value) => typeof value === 'string' || value instanceof String;
export const isEmpty = (value) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && Object.keys(value).length === 0);
export const isArray = obj => Array.isArray(obj)
export const isFn = (obj, key) => obj && typeof obj[key] === 'function';


/**
 * make a deep copy
 * @param {object} obj 
 * @returns {object}
 */
export const copy = obj => {
  if (obj === null || !isPlainObject(obj)) return obj;
  let temp = obj.constructor();
  for (const key in obj) {
    if (key in obj) temp[key] = copy(obj[key]);
  }
  return temp;
};



/**
 * =====
 * Reactive State
 *  
 * @param [object]
 * 
 * Example
 * const s = {
 *  n: 1,
 *  x: 2
 * }
 * 
 * const state = useReactiveState(s:object)
 * state.subscribe((changed, prev, state) => console.log("Data changed: ", changed))
 * 
 * -- Apply changes, subscription will run on each change
 * 
 * state.n = 2 // 
 * state.x = 3
 * state.z = 4
 * 
 * -- Apply patching. Subscription will run once on each group change
 * state.__patch__ = {
 *  n: 4,
 *  w: z,
 * }
 * 
 */


export const useReactiveState = (target: object)  => {
  const observers: Function[] = [];
  return new Proxy(target, {
    get: (target, property) => {
      return property === 'subscribe' ? (observer: Function) => {
        observers.push(observer);
        return () => observers.splice(observers.indexOf(observer), 1);
      } : target[property]
    },
    set: (target, property, value) => {
      const prev = copy(target); // hold the previous state
      if (property === "__patch__") {
        for (const k of Object.keys(value)) {
          target[k] = value[k];
        }
      } else {
        target[property] = value;
      }
      observers.forEach(observer => observer(value, prev, target));
      return true;
    },
		deleteProperty: (target, property) => {
      if (property in target) {
        const value = copy(target[property])
        const prev = copy(target); // hold the previous state
        delete target[property];
        observers.forEach(observer => observer(value, prev, target));
        return true;
      }
      return false;
			
		},
  });
};


/**
 * Turn a fullname into first and last name
 * @param {String} name
 * @returns {[firstName:string, lastName: string]}
 */
export const splitFullName = (name:string): [string, string] => {
  const firstName = name.split(' ')[0];
  const lastName = name.substring(firstName.length).trim();
  return [firstName, lastName];
};



export const AuthResultOk = (data:any, action:string|null=null): AuthResultInterface => ({
  ok: true,
  data,
  action,
  error: null
})

export const AuthResultErr = (error:any, action:string|null=null): AuthResultInterface => ({
  ok: false,
  data: null,
  action,
  error
})


/**
 * MemCache
 * A localStorage/sessionStorage wrapper that adds TTL (Time-To-Live) functionality.
 * 
 * Methods:
 *  - set(key: string, data: any, ttl?: number): any
 *  - get(key: string): any | undefined
 *  - remove(key: string): boolean
 *  - purge(): void
 *  - parseData(data: string | null): Record<string, [number, any]>
 */

type StorageOptions = {
  namespace?: string;
  storage?: Storage;
};

type CacheEntry = [number, any]; // [TTL, Data]
type CacheData = Record<string, CacheEntry>;

const memcache = (db: string = "__default__", options: StorageOptions = {}) => {
  const { namespace = 'c0', storage = window.sessionStorage } = options;
  const fullNamespace = `${namespace}:${db}`;

  /**
   * Parses the stored JSON data.
   * @param data - JSON string from storage.
   * @returns Parsed CacheData or an empty object on failure.
   */
  const parseData = (data: string | null): CacheData => {
    if (!data) return {};
    try {
      return JSON.parse(data) as CacheData;
    } catch {
      console.warn(`Failed to parse data for namespace "${fullNamespace}". Resetting cache.`);
      return {};
    }
  };

  /**
   * Retrieves the current cache data from storage.
   * @returns CacheData object.
   */
  const getData = (): CacheData => parseData(storage.getItem(fullNamespace));

  /**
   * Saves the provided cache data back to storage.
   * @param data - CacheData object to save.
   */
  const setData = (data: CacheData): void => {
    try {
      storage.setItem(fullNamespace, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to set data for namespace "${fullNamespace}":`, e);
    }
  };

  /**
   * Sets a key-value pair in the cache with an optional TTL.
   * @param key - The key to set.
   * @param data - The data to store.
   * @param ttl - Time-To-Live in seconds. Defaults to 0 (no expiration).
   * @returns The stored data.
   */
  const set = (key: string, data: any, ttl: number = 0): any => {
    const currentData = getData();
    const expiration = ttl > 0 ? Date.now() + ttl * 1000 : 0;
    currentData[key] = [expiration, data];
    setData(currentData);
    return data;
  };

  /**
   * Retrieves the data for a given key if it hasn't expired.
   * @param key - The key to retrieve.
   * @returns The stored data or undefined if not found or expired.
   */
  const get = (key: string): any | undefined => {
    const currentData = getData();
    const entry = currentData[key];

    if (!entry) return undefined;

    const [ttl, value] = entry;

    if (ttl === 0 || Date.now() <= ttl) {
      return value;
    } else {
      remove(key); // Clean up expired entry
      return undefined;
    }
  };

  /**
   * Removes a specific key from the cache.
   * @param key - The key to remove.
   * @returns True if the key was removed, false otherwise.
   */
  const remove = (key: string): boolean => {
    const currentData = getData();
    if (key in currentData) {
      delete currentData[key];
      setData(currentData);
      return true;
    }
    return false;
  };

  /**
   * Clears all entries in the current namespace.
   */
  const purge = (): void => {
    storage.removeItem(fullNamespace);
  };

  return {
    namespace: fullNamespace,
    set,
    get,
    remove,
    purge,
    parseData,
  };
};

/**
 * Creates a storage instance using localStorage.
 * @param db - The database namespace.
 * @returns A memcache instance.
 */
export const useStorage = (db: string = '__default__') => 
  memcache(db, { storage: window.localStorage });

/**
 * Creates a storage instance using sessionStorage.
 * @param db - The database namespace.
 * @returns A memcache instance.
 */
export const useTempStorage = (db: string = '__default__') => 
  memcache(db, { storage: window.sessionStorage });



export function parseXmlToJson(xml) {
  const json = {};
  for (const res of xml.matchAll(/(?:<(\w*)(?:\s[^>]*)*>)((?:(?!<\1).)*)(?:<\/\1>)|<(\w*)(?:\s*)*\/>/gm)) {
    const key = res[1] || res[3];
    const value = res[2] && parseXmlToJson(res[2]);
    json[key] = ((value && Object.keys(value).length) ? value : res[2]) || null;

  }
  return json;
}

/**
 * Extracts a specific segment (32-character hexadecimal string) from a given URL or string.
 * The segment can be preceded by an optional forward slash and may or may not have a file extension.
 *
 * @param {string} url - The URL or string from which to extract the segment.
 * @returns {string|null} - The extracted segment if found, or null if not found.
 * 
 * Example
 * 
 *  "https://s3.amazonaws.com/bucket/ni5ibc3ldse4dku9.l3nkghmqz2eovqh8/d55211fb9de74e8784e6a6b8b2aa1b81--small.png",
    "https://s3.amazonaws.com/bucket/ni5ibc3ldse4dku9.l3nkghmqz2eovqh8/d55211fb9de74e8784e6a6b8b2aa1b81--thumbnail.jpg",
    "ni5ibc3ldse4dku9.l3nkghmqz2eovqh8/d55211fb9de74e8784e6a6b8b2aa1b81.gif",
    "https://s3.amazonaws.com/bucket/ni5ibc3ldse4dku9.l3nkghmqz2eovqh8/d55211fb9de74e8784e6a6b8b2aa1b81.jpeg",
    "d55211fb9de74e8784e6a6b8b2aa1b81.gif",
    "d55211fb9de74e8784e6a6b8b2aa1b81
    -> d55211fb9de74e8784e6a6b8b2aa1b81
 */
export function extractFileKey(url) {
  // Regular expression to match the segment based on pattern
  const regex = /\/?([a-f0-9]{32})(?:--\w+)?(?:\.\w+)?$/;
  // Execute the regex on the input URL
  const match = url.match(regex);
  // Return the extracted segment or null if not found
  return match ? match[1] : null;
}



export function removeTrailingSlash(str:string):string {
  return str.replace(/\/+$/, '');
}


/**
 * Checks if a given string starts with any of the specified prefixes.
 *
 * @param {string} value - The string value to check.
 * @param {string[]} prefixes - An array of prefixes to check against.
 * @returns {boolean} - Returns true if the value starts with any of the prefixes, false otherwise.
 * @throws {Error} - Throws an error if the value is not a string or if prefixes is not an array.
 */
export function startsWithAny(value, prefixes): boolean {
  if (typeof value !== 'string') {
    throw new Error('Input must be a string.');
  }
  if (!Array.isArray(prefixes)) {
    throw new Error('Prefixes must be an array.');
  }
  return prefixes.some(prefix => value.startsWith(prefix));
}