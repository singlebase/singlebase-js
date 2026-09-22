export { SinglebaseClient, SinglebaseAuth } from "./client.js";
export type {
  SinglebaseClientInstance,
  SinglebaseClientOptions,
  ServiceNamespace,
  ServiceCallOptions
} from "./client.js";

// One import for an app that wants the whole surface.
export {
  SinglebaseError,
  SinglebaseAuthError,
  mapErrorToHint,
  getDefaultClient,
  setDefaultClient,
  memoryStorage,
  localStorageAdapter,
  sessionStorageAdapter,
  indexedDbCryptoStorage
} from "@singlebase/core";
export type { DispatchEnvelope, DispatchOptions, SinglebaseOptions } from "@singlebase/core";
export { resolveScreen } from "@singlebase/auth";
export type {
  AuthClient,
  AuthSession,
  AuthState,
  UserProfile,
  AuthSettings
} from "@singlebase/auth";
