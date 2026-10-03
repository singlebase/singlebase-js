import { SinglebaseAuthError, mapErrorToHint } from "@singlebase/singlebase-sdk";
import type { SinglebaseAuthMessages } from "../messages.js";

/**
 * The message to show for a failed auth call, following the spec's error
 * table. Messages stay generic where detail could reveal whether an account
 * exists or how a provider is set up.
 */
export function describeAuthError(error: unknown, msg: SinglebaseAuthMessages): string {
  if (!(error instanceof SinglebaseAuthError)) return msg.genericErrorMessage;

  switch (mapErrorToHint(error.code)) {
    case "disable_retry_show_rate_limited":
      return msg.rateLimitedMessage;
    case "show_password_requirements":
      return msg.invalidPasswordMessage;
    case "expired_or_invalid_code_message":
      return msg.invalidCodeError;
    case "explain_verified_email_required":
      return msg.oauthVerifiedEmailMessage;
    case "restart_oauth":
    case "restart_oauth_new_nonce":
      return msg.oauthRetryMessage;
    case "ask_signin_then_link":
      return msg.signInToLinkMessage;
    case "provider_already_linked":
      return msg.providerAlreadyLinkedMessage;
    case "hide_oauth":
    case "remove_oauth_from_signin":
    case "remove_oauth_from_signup":
    case "refresh_settings_hide_provider":
      return msg.oauthUnavailableMessage;
    case "show_integrator_config_error":
      // Meant for the developer, not the visitor: say what to fix in the console.
      console.warn(`[singlebase] Auth is misconfigured for this project (${error.code}).`);
      return error.code === "MISSING_OAUTH_CREDENTIALS"
        ? msg.oauthUnavailableMessage
        : msg.genericErrorMessage;
    default:
      return msg.genericErrorMessage;
  }
}
