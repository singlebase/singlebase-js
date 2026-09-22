export { createAuthClient } from "./client.js";
export type { AuthClient } from "./client.js";
export { AutoRefreshScheduler } from "./auto-refresh.js";
export type { AutoRefreshOptions } from "./auto-refresh.js";
export { SessionStore } from "./session.js";
export { resolveScreen } from "./navigation.js";
export type { Screen } from "./navigation.js";
export * from "./types.js";

// Re-exported so auth-only consumers need one import.
export { SinglebaseError, SinglebaseAuthError, mapErrorToHint } from "@singlebase/core";
export type { ErrorHint, DispatchEnvelope, DispatchOptions } from "@singlebase/core";
