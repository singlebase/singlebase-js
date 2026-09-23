import type { NavigationHint, NextAction } from "./types.js";

/**
 * The screen a UI router should open for a given `next_action`, taken
 * verbatim from the auth API's routing table. Components must use this
 * (and `next_operation`, returned alongside) instead of guessing the next
 * screen from which method just resolved.
 */
export type Screen =
  | "signin"
  | "signin_with_code"
  | "accept_invite"
  | "reset_password_confirm"
  | "change_email_confirm"
  | "change_username_confirm"
  | "authenticated";

const ROUTES: Record<Exclude<NextAction, null>, Screen> = {
  SIGNIN: "signin",
  SIGNIN_WITH_CODE: "signin_with_code",
  ACCEPT_INVITE_WITH_CODE: "accept_invite",
  RESET_PASSWORD_WITH_CODE: "reset_password_confirm",
  CHANGE_EMAIL_WITH_CODE: "change_email_confirm",
  CHANGE_USERNAME_WITH_CODE: "change_username_confirm"
};

/**
 * Resolves a `{ next_action, next_operation }` pair into the screen a router
 * should open. `next_action: null` always means "authentication is complete" —
 * route to the host application's authenticated destination.
 */
export function resolveScreen(hint: NavigationHint): Screen {
  if (hint.next_action === null) return "authenticated";
  return ROUTES[hint.next_action];
}
