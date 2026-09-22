import type { Audience, SinglebaseOptions, SinglebaseStorage } from "@singlebase/core";
import type { AutoRefreshOptions } from "./auto-refresh.js";

export type { AutoRefreshOptions };

/** Auth persists an AuthSession through the generic core storage interface. */
export type AuthStorage = SinglebaseStorage<AuthSession>;

// ---------------------------------------------------------------------------
// Session / user
// ---------------------------------------------------------------------------

export interface TokenInfo {
  ttl: number;
  exp: number;
  iat: number;
  aud: string;
  id: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_photo: string | null;
  status: string;
  requires_password_change: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  created_at: string | null;
  modified_at: string | null;
  timezone: string | null;
  locale: string | null;
  metadata: Record<string, unknown> | null;
  aud: string;
  roles: string[];
}

export interface AuthSession {
  id_token: string;
  refresh_token: string;
  token_type: "bearer";
  user_profile: UserProfile;
  next_action: null;
  next_operation: null;
  token_info: TokenInfo;
}

// ---------------------------------------------------------------------------
// Navigation contract
// ---------------------------------------------------------------------------

export type NextAction =
  | "SIGNIN"
  | "SIGNIN_WITH_CODE"
  | "ACCEPT_INVITE_WITH_CODE"
  | "RESET_PASSWORD_WITH_CODE"
  | "CHANGE_EMAIL_WITH_CODE"
  | "CHANGE_USERNAME_WITH_CODE"
  | null;

export type NextOperation = "auth.signin" | "auth.confirm_code" | null;

export interface NavigationHint {
  next_action: NextAction;
  next_operation: NextOperation;
}

// ---------------------------------------------------------------------------
// Auth settings
// ---------------------------------------------------------------------------

export interface PasswordPolicy {
  NAME: string;
  LENGTH: [number, number];
  SYMBOLS: boolean;
  NUMBERS: boolean;
  LOWERCASE: boolean;
  UPPERCASE: boolean;
}

export interface OAuthProviderSettings {
  enabled: boolean;
  type: string;
  name: string;
  provider_name: string;
}

export interface AuthSettings {
  enabled: boolean;
  auth_settings: {
    enabled: boolean;
    allow_signin: boolean;
    allow_signup: boolean;
    identifier: string[];
    signin_method: string;
    second_factor: string | null;
    signup_verify_email: boolean;
    account_update_verification: string | null;
    password_policy: PasswordPolicy;
  };
  oauth_settings: {
    enabled: boolean;
    allow_signin: boolean;
    allow_signup: boolean;
  };
  oauth_providers: Record<string, OAuthProviderSettings>;
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export interface SignUpInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  profile_photo?: string;
  metadata?: Record<string, unknown>;
  aud?: Audience;
}

export interface SignUpResult {
  id: string;
  next_action: "SIGNIN" | "SIGNIN_WITH_CODE";
  next_operation: "auth.signin";
}

// ---------------------------------------------------------------------------
// Signin
// ---------------------------------------------------------------------------

export interface PasswordSignInInput {
  email: string;
  password: string;
  aud?: Audience;
  /** Required when auth_settings.second_factor === "email_otp" */
  code?: string;
}

export interface CodeSignInInput {
  email: string;
  grant_type: "code";
  code: string;
  aud?: Audience;
}

export type SignInInput = PasswordSignInInput | CodeSignInInput;

// ---------------------------------------------------------------------------
// Request code
// ---------------------------------------------------------------------------

export type CodePurpose =
  "signin" | "invite" | "password_reset" | "email_change" | "username_change";

export interface RequestCodeInput {
  email: string;
  purpose: CodePurpose;
  aud?: Audience;
}

export interface RequestCodeResult {
  accepted: true;
  purpose: CodePurpose;
  next_action:
    | "SIGNIN_WITH_CODE"
    | "ACCEPT_INVITE_WITH_CODE"
    | "RESET_PASSWORD_WITH_CODE"
    | "CHANGE_EMAIL_WITH_CODE"
    | "CHANGE_USERNAME_WITH_CODE";
  next_operation: "auth.signin" | "auth.confirm_code";
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export interface ResetPasswordInput {
  email: string;
  code: string;
  new_password: string;
  aud?: Audience;
}

// ---------------------------------------------------------------------------
// Accept invite
// ---------------------------------------------------------------------------

export interface AcceptInviteInput {
  email: string;
  grant_type: "code";
  purpose: "invite";
  code: string;
  password: string;
  phone?: string;
  aud?: Audience;
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export interface RefreshInput {
  id_token: string;
  refresh_token: string;
  aud?: Audience;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface UpdateAccountInput {
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_photo?: string;
  timezone?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

export interface ChangePasswordInput {
  password: string;
  aud?: Audience;
}

export interface ChangeEmailInput {
  email: string;
  code: string;
  new_email: string;
  aud?: Audience;
}

export interface ChangeUsernameInput {
  email: string;
  code: string;
  new_username: string;
  aud?: Audience;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export type OAuthIntent = "signin" | "signup" | "link";

export interface StartOAuthInput {
  provider: string;
  nonce: string;
  intent?: OAuthIntent;
  aud?: Audience;
  /** required for intent "link" */
  id_token?: string;
  /** required for intent "link" */
  refresh_token?: string;
}

export interface OAuthConnectResult {
  oauth_redirect_url: string;
  oauth_provider: string;
}

export interface CompleteOAuthInput {
  access_code: string;
  nonce: string;
  aud?: Audience;
}

// ---------------------------------------------------------------------------
// Client options / state
// ---------------------------------------------------------------------------

export interface AuthClientOptions extends SinglebaseOptions {
  /** Defaults to encrypted IndexedDB, falling back to sessionStorage. */
  storage?: AuthStorage;
  /** Activity-aware token refresh. `true`/omitted uses the defaults. */
  autoRefresh?: boolean | AutoRefreshOptions;
  /**
   * Keep other tabs of the same origin in step with this one: signing in or
   * out here updates them too. On by default; set `false` to opt out.
   */
  crossTab?: boolean;
  /** Callbacks registered before the first event can fire. */
  on?: AuthEventHandlers;
}

export type AuthEventHandlers = {
  [K in keyof AuthEventMap]?: (detail: AuthEventMap[K]) => void;
};

export type AuthState =
  | { status: "loading"; session: null; user: null }
  | { status: "authenticated"; session: AuthSession; user: UserProfile }
  | { status: "unauthenticated"; session: null; user: null }
  | { status: "error"; session: AuthSession | null; user: UserProfile | null; error: unknown };

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AuthEventMap {
  /** Client finished initializing: storage read, session restored or not. */
  load: AuthState;
  /** Any operation completed successfully. */
  success: { operation: string; data?: unknown };
  /** Any operation failed. Never carries tokens or raw server payloads. */
  error: { code: string; message: string; operation?: string };
  signin: AuthSession;
  signup: SignUpResult;
  signout: null;
  /** The active session was replaced (sign-in, refresh, password/email change). */
  session: AuthSession | null;
  "account-updated": UserProfile;
  "password-change": AuthSession;
  "email-change": AuthSession;
  "username-change": AuthSession;
  /** Session ended involuntarily — refresh failed and auto-refresh stopped. */
  expired: { reason: string };
  /** Routing hint from the server's next_action/next_operation pair. */
  navigate: NavigationHint;
  /** A host asked every bound widget to show a screen. */
  goto: { screen: string };
}

export type AuthEventName = keyof AuthEventMap;
