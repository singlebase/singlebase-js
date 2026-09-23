export { RpcDispatcher } from "./dispatcher.js";
export type {
  DispatchEnvelope,
  DispatchOptions,
  DispatcherAuthBridge,
  AuthBridgeProvider
} from "./dispatcher.js";
export {
  request,
  assertSecureBaseUrl,
  resolveBaseUrl,
  endpointFor,
  DEFAULT_BASE_URL
} from "./transport.js";
export { SinglebaseError, SinglebaseAuthError, mapErrorToHint } from "./errors.js";
export type { ErrorHint } from "./errors.js";
export {
  memoryStorage,
  localStorageAdapter,
  sessionStorageAdapter,
  indexedDbCryptoStorage,
  defaultStorage,
  canUseCryptoStorage
} from "./storage.js";
export { EventEmitter } from "./events.js";
export { AUTHUI_PROP_KEYS, authUIAttributeFor } from "./authui-config.js";
export type { AuthUIConfig } from "./authui-config.js";
export { matchesPredicate, validatePredicate, getPath, OPERATORS } from "./predicate.js";
export type { Predicate, Condition, Operator } from "./predicate.js";
export { crossTabChannel, noopCrossTabChannel } from "./cross-tab.js";
export type { CrossTabChannel, CrossTabMessage, CrossTabSignal } from "./cross-tab.js";
export {
  resolveClient,
  getDefaultClient,
  setDefaultClient,
  unregisterClient,
  clientKey
} from "./registry.js";
export * from "./types.js";
