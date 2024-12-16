
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
 * Class to handle storage with automatic expiry functionality.
 * Supports both localStorage and sessionStorage with configurable TTL.
 */
export class TimeStorage {
  /**
   * @param {string} keyPrefix - Prefix to append to all keys.
   * @param {number} defaultTTL - Default time-to-live (TTL) for items in seconds.
   * @param {'local' | 'session'} storageType - Type of storage to use ('local' for localStorage, 'session' for sessionStorage).
   */
  constructor(keyPrefix = 'singlebase.__default__:', defaultTTL = 3600, storageType = 'local') {
    this.storage = storageType === 'session' ? window.sessionStorage : window.localStorage;
    this.defaultTTL = defaultTTL;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Stores an item in the storage with a specified TTL.
   * @param {string} key - The key under which the item is stored.
   * @param {*} value - The value to store.
   * @param {number} [timeoutInSeconds] - Optional TTL in seconds. Defaults to the class defaultTTL.
   */
  setItem(key, value, timeoutInSeconds = this.defaultTTL) {
    const expiry = Date.now() + timeoutInSeconds * 1000;
    const data = { value, expiry };
    this.storage.setItem(this.keyPrefix + key, JSON.stringify(data));
  }

  /**
   * Retrieves an item from the storage, if it hasn't expired.
   * @param {string} key - The key of the item to retrieve.
   * @returns {*} The value of the item, or null if it has expired or doesn't exist.
   */
  getItem(key) {
    const storedData = this.storage.getItem(this.keyPrefix + key);
    if (!storedData) return null;

    try {
      const { value, expiry } = JSON.parse(storedData);
      if (Date.now() > expiry) {
        this.removeItem(key);
        return null; // Item has expired
      }
      return value;
    } catch (error) {
      console.error('Error parsing data from storage:', error);
      return null;
    }
  }

  /**
   * Removes an item from the storage.
   * @param {string} key - The key of the item to remove.
   */
  removeItem(key) {
    this.storage.removeItem(this.keyPrefix + key);
  }

  /**
   * Clears all expired items from the storage.
   */
  clearExpiredItems() {
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.keyPrefix)) {
        this.getItem(key.substring(this.keyPrefix.length)); // `getItem` will remove it if it's expired
      }
    }
  }
}


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