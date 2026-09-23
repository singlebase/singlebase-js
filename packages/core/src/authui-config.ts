/**
 * Page-wide configuration for the singlebase-authui elements.
 *
 * It lives in core rather than in the UI package so `SinglebaseClient()` can
 * accept it without the SDK taking a dependency on Lit. The UI package reads
 * it back off the client; nothing here imports or renders anything.
 *
 * Precedence is deliberately simple: **an attribute on the element wins.**
 * This is the page-level default, so one call configures every widget, and any
 * individual widget can still opt out by setting the attribute itself.
 */
export interface AuthUIConfig {
  // ── appearance ───────────────────────────────────────────
  theme?: "light" | "dark";
  density?: "comfortable" | "compact";
  fieldStyle?: "outline" | "underline";

  /** `--sb-*` custom properties, e.g. { "--sb-accent": "#2f5bea" }. */
  tokens?: Record<string, string>;

  // ── layout & branding ────────────────────────────────────
  layout?: "card" | "split";
  oauthPlacement?: "top" | "bottom";
  stepped?: boolean;
  logoUrl?: string;
  logoText?: string;
  brandLine?: string;
  brandFoot?: string;
  signInTitle?: string;
  /** The "Auth by Singlebase" credit under the card. On unless set false. */
  branding?: boolean;

  // ── screens & behaviour ──────────────────────────────────
  initialScreen?: string;
  noAccountView?: boolean;
  redirectUrl?: string;
  tosUrl?: string;
  privacyUrl?: string;
  nonceStorageKey?: string;

  // ── sign-in methods ──────────────────────────────────────
  authEnabled?: boolean;
  allowEmailSignin?: boolean;
  allowEmailSignup?: boolean;
  allowEmailOtp?: boolean;
  allowOauth?: boolean;
  allowAccountCreation?: boolean;

  // ── invite prefill ───────────────────────────────────────
  inviteEmail?: string;
  inviteOrg?: string;
  inviteCode?: string;

  /** Overrides for any subset of the default message strings. */
  messages?: Record<string, string>;
}

/** Config keys that are applied as element properties, not handled specially. */
export const AUTHUI_PROP_KEYS = [
  "theme",
  "density",
  "fieldStyle",
  "layout",
  "oauthPlacement",
  "stepped",
  "logoUrl",
  "logoText",
  "brandLine",
  "brandFoot",
  "signInTitle",
  "branding",
  "initialScreen",
  "noAccountView",
  "redirectUrl",
  "tosUrl",
  "privacyUrl",
  "nonceStorageKey",
  "authEnabled",
  "allowEmailSignin",
  "allowEmailSignup",
  "allowEmailOtp",
  "allowOauth",
  "allowAccountCreation",
  "inviteEmail",
  "inviteOrg",
  "inviteCode"
] as const satisfies readonly (keyof AuthUIConfig)[];

/** "fieldStyle" -> "field-style", for checking whether the host set it in markup. */
export function authUIAttributeFor(key: string): string {
  return key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
