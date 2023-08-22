/**
 * Utilities
 */


export const isPlainObject = (value) => typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
export const isString = (value) => typeof value === 'string' || value instanceof String;
export const isEmpty = (value) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && Object.keys(value).length === 0);
export const isArray = obj => Array.isArray(obj)
export const isFn = (obj, key) => obj && typeof obj[key] === 'function';


/**
 * 
 * @param {*} obj 
 * @returns 
 */
function deepCopy(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  var temp = obj.constructor();
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key))
      temp[key] = immu(obj[key]);
  }
  return temp;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.keys(obj).forEach(function(name) {
    const prop = obj[name];
    if (prop !== null && typeof prop === 'object') deepFreeze(prop);
  });
  return Object.freeze(obj);
}

export const immu = obj => deepFreeze(deepCopy(obj));


export function parseXmlToJson(xml) {
  const json = {};
  for (const res of xml.matchAll(/(?:<(\w*)(?:\s[^>]*)*>)((?:(?!<\1).)*)(?:<\/\1>)|<(\w*)(?:\s*)*\/>/gm)) {
    const key = res[1] || res[3];
    const value = res[2] && parseXmlToJson(res[2]);
    json[key] = ((value && Object.keys(value).length) ? value : res[2]) || null;

  }
  return json;
}

export const getKeyFromFilePath = file_url_or_key => {
  if (file_url_or_key.indexOf('/') >= 0) {
    file_url_or_key = file_url_or_key.split('/').pop()
    if (file_url_or_key.indexOf('--') >= 0) {
      file_url_or_key = file_url_or_key.split("--")[0]
    }
  }
  if (file_url_or_key.indexOf('.') >= 0) {
    return file_url_or_key.split(".")[0]
  }
  return file_url_or_key
};


export function removeTrailingSlash(str:string):string {
  return str.replace(/\/+$/, '');
}