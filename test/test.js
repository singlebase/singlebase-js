import { isArray, isPlainObject, isEmpty, isString } from '../src/utils.ts'
//import CreateClient from '../src/index.js';


test('isEmpty', () => {
  expect(isEmpty()).toBe(true);
  expect(isEmpty('')).toBe(true);
  expect(isEmpty(null)).toBe(true);
  expect(isEmpty(undefined)).toBe(true);
  expect(isEmpty({})).toBe(true);
  expect(isEmpty([])).toBe(true);
  expect(isEmpty(0)).toBe(false);
  expect(isEmpty('str')).toBe(false);
  expect(isEmpty(1)).toBe(false);
});

test('isArray', () => {
  expect(isArray([])).toBe(true);
  expect(isArray({})).toBe(false);
  expect(isArray(1)).toBe(false);
});

test('isPlainObject', () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(1)).toBe(false);
})

test('isString', () => {
  expect(isString('')).toBe(true);
  expect(isString('hello')).toBe(true);
  expect(isString(new String('Hi'))).toBe(true);
  expect(isString([])).toBe(false);
  expect(isString({})).toBe(false);
  expect(isString(undefined)).toBe(false);
  expect(isString(null)).toBe(false);
})