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

