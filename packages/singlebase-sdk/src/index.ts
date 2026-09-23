export { SinglebaseClient, SinglebaseAuth } from "./client.js";
export type {
  SinglebaseClientInstance,
  SinglebaseClientOptions,
  ServiceNamespace,
  ServiceCallOptions,
  FilesNamespace
} from "./client.js";

export { FILES_BATCH_SIZE, normalizeUploadError, createFilesUploadApi } from "./files.js";
export type {
  FileUploadInput,
  FileUploadSource,
  InitiatedUpload,
  UploadCompletion,
  UploadError,
  UploadFailure,
  UploadOptions,
  UploadProgress,
  UploadResult,
  FilesUploadApi
} from "./files.js";

// Authentication: the client, the session store, the refresh scheduler, the
// navigation table and every input/result type.
export * from "./auth/index.js";

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
export type {
  ErrorHint,
  DispatchEnvelope,
  DispatchOptions,
  SinglebaseOptions
} from "@singlebase/core";
