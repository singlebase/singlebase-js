import type { ErrorResponsePayload } from "./types.js";

/**
 * Normalized error thrown by every SDK method. `code` is the server's
 * machine-readable `error.message` (e.g. "INVALID_CREDENTIALS"), never the
 * human-readable text.
 */
export class SinglebaseError extends Error {
  status: number;
  type: string;
  code: string;
  details?: unknown;
  traceId?: string | null;
  override cause?: unknown;

  constructor(payload: ErrorResponsePayload, cause?: unknown) {
    super(payload.message);
    this.name = "SinglebaseError";
    this.status = payload.status;
    this.type = payload.type;
    this.code = payload.message;
    this.details = payload.details;
    this.traceId = payload.trace_id ?? null;
    this.cause = cause;
  }

  static fromNetworkError(cause: unknown): SinglebaseError {
    return new SinglebaseError(
      {
        type: "NETWORK_ERROR",
        status: 0,
        message: "NETWORK_ERROR"
      },
      cause
    );
  }
}

/**
 * Recommended UI behavior for a given server error code, taken verbatim from
 * component-spec.md's error-mapping table. UI components use this to decide
 * *behavior* (focus a field, trigger a refresh, sign out locally); the actual
 * copy shown to the user is left to each component/its `.messages` override.
 */
export type ErrorHint =
  | "highlight_invalid_fields"
  | "generic_credentials_message"
  | "reveal_code_input"
  | "expired_or_invalid_code_message"
  | "attempt_refresh_or_signout"
  | "clear_session_and_ask_signin"
  | "clear_session_config_error"
  | "route_to_recovery_or_invite"
  | "show_password_requirements"
  | "require_changed_field"
  | "disable_retry_show_rate_limited"
  | "render_auth_unavailable"
  | "hide_email_forms"
  | "hide_signup"
  | "hide_oauth"
  | "remove_oauth_from_signup"
  | "refresh_settings_hide_provider"
  | "restart_oauth_new_nonce"
  | "ask_signin_then_link"
  | "route_to_signin"
  | "show_integrator_config_error"
  | "unknown";

const ERROR_HINTS: Record<string, ErrorHint> = {
  INVALID_PAYLOAD: "highlight_invalid_fields",
  INVALID_CREDENTIALS: "generic_credentials_message",
  CODE_REQUIRED: "reveal_code_input",
  INVALID_TOKEN: "expired_or_invalid_code_message",
  INVALID_ID_TOKEN: "attempt_refresh_or_signout",
  INVALID_BEARER_TOKEN: "attempt_refresh_or_signout",
  INVALID_SESSION: "clear_session_and_ask_signin",
  INVALID_TOKEN_AUDIENCE: "clear_session_config_error",
  REQUIRE_PASSWORD_CHANGE: "route_to_recovery_or_invite",
  INVALID_PASSWORD: "show_password_requirements",
  MISSING_PROFILE_DATA: "require_changed_field",
  AUTH_RATE_LIMITED: "disable_retry_show_rate_limited",
  AUTH_DISABLED: "render_auth_unavailable",
  EMAIL_PROVIDER_DISABLED: "hide_email_forms",
  EMAIL_SIGNUP_DISABLED: "hide_signup",
  OAUTH_DISABLED: "hide_oauth",
  OAUTH_SIGNUP_DISABLED: "remove_oauth_from_signup",
  INVALID_OAUTH_PROVIDER: "refresh_settings_hide_provider",
  INVALID_NONCE: "restart_oauth_new_nonce",
  SIGN_IN_TO_LINK_PROVIDER: "ask_signin_then_link",
  AUTHENTICATION_REQUIRED: "route_to_signin",
  UNAUTHORIZED_DOMAIN: "show_integrator_config_error"
};

export function mapErrorToHint(code: string): ErrorHint {
  return ERROR_HINTS[code] ?? "unknown";
}

/** Back-compat alias: the error type is shared by every service. */
export { SinglebaseError as SinglebaseAuthError };
