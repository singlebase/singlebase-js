# Singlebase Auth SDK and JavaScript UI Component Specification

## Purpose

Use this document as the source of truth for generating a browser JavaScript authentication SDK and a reusable authentication UI component library for Singlebase projects.

Generate a framework-neutral core SDK first. Build the UI components on top of that SDK. Do not make UI components call `fetch` directly. The UI may be exposed as standards-based custom elements and may also have thin React, Vue, or other framework adapters.

The API is RPC-style. All operations are sent to one project endpoint. Do not invent REST routes such as `/signin`, `/users/me`, or `/reset-password`.

This specification covers public auth settings, signup, password and code signin, refresh, signout, password recovery, password change, account information and profile updates, email and username changes, invitations, and OAuth.

## Transport contract

### Project endpoint

```text
POST {baseUrl}/api/{urlAccessKey}
```

Required headers:

```http
Content-Type: application/json
X-API-Key: {webApiKey}
```

Protected operations also require:

```http
Authorization: Bearer {idToken}
```

The client-facing API key should be a project web key with the `wk_` prefix. Never embed root, server, or agent keys in browser code.

Browser requests made with a web key must come from HTTPS, except on `localhost`, `127.0.0.1`, or `0.0.0.0`. The browser origin or referrer hostname must be in the project's authorized domains.

### Request envelope

Every operation uses this JSON body:

```json
{
  "operation": "auth.signin",
  "payload": {
    "email": "ada@example.com",
    "password": "correct horse battery staple"
  }
}
```

The envelope accepts only `operation`, `payload`, and the optional `collection` and `options` properties. Auth and user operations do not need `collection`. Always send `payload`, using `{}` when an operation has no fields.

Unknown payload fields are currently ignored by the server, but generated clients must not depend on this behavior.

### Success response

```json
{
  "data": {},
  "meta": {},
  "exec_time": 0.012
}
```

SDK methods should return `response.data`, not the complete transport wrapper. Preserve the full response on a lower-level request method for debugging if desired.

### Error response

```json
{
  "error": {
    "type": "UNAUTHORIZED_ERROR",
    "status": 401,
    "message": "INVALID_CREDENTIALS",
    "trace_id": null
  },
  "meta": {},
  "exec_time": 0.008
}
```

`details` is omitted when empty. `trace_id` can be null.

The SDK should throw one normalized error class:

```ts
class SinglebaseAuthError extends Error {
  status: number;
  type: string;
  code: string;       // value of server error.message
  details?: unknown;
  traceId?: string | null;
  cause?: unknown;
}
```

Use `error.message` from the server as the machine-readable `code`, for example `INVALID_CREDENTIALS`, `CODE_REQUIRED`, or `AUTH_RATE_LIMITED`. UI text must map known codes to friendly messages and use a safe generic fallback. Do not show raw server details or trace IDs to end users.

## Shared rules and types

### Audience

Most auth payloads accept:

```ts
aud?: string // default: "web", length 1 to 128
```

The audience selects the account's roles and is bound into the session. A normal website SDK should configure one audience, usually `web`, and apply it consistently to signup, signin, code requests, code confirmation, refresh, and OAuth.

For protected operations, omit `aud` when possible. If supplied, it must match the audience in the bearer token.

### Email

Emails are trimmed, converted to lowercase, and validated. Email subaddressing is not accepted. The length is 3 to 320 characters.

### Password

Passwords are plain strings sent only over HTTPS. They are not trimmed and whitespace is significant. The transport allows 1 to 1024 characters, but the project password policy may impose stronger requirements. Load `auth.settings` to obtain the current policy. Never pre-hash a password and never send `password_hash` or `password_algo`.

### Session

Operations that create or replace a session return:

```ts
type AuthSession = {
  id_token: string;
  refresh_token: string;
  token_type: "bearer";
  user_profile: UserProfile;
  next_action: null;
  next_operation: null;
  token_info: {
    ttl: number;
    exp: number;
    iat: number;
    aud: string;
    id: string;
  };
};
```

`exp` and `iat` are Unix timestamps in seconds. The current ID-token lifetime is 15 minutes. The current refresh-session lifetime is 30 days. Clients should use returned values instead of hard-coding these durations.

### User profile

```ts
type UserProfile = {
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
};
```

Date strings are ISO 8601 values. A safe profile never contains password hashes, token records, provider credentials, or internal auth metadata.

### Profile aliases

The server accepts these legacy input aliases, but the generated SDK should expose only the canonical names:

| Canonical field | Accepted legacy alias |
| --- | --- |
| `first_name` | `name` |
| `last_name` | `surname` |
| `phone` | `phone_number` |
| `profile_photo` | `photo_url` |
| `code` | `otp` |
| `grant_type: "code"` | `grant_type: "otp"` |
| `intent: "signin"` | `intent: "login"` |

## Operation summary

| SDK method | API operation | Access | Result |
| --- | --- | --- | --- |
| `getSettings` | `auth.settings` | Public | `AuthSettings` |
| `signUp` | `auth.signup` | Public | Signup acknowledgement |
| `signIn` | `auth.signin` | Public | `AuthSession` |
| `refreshSession` | `auth.refresh` | Public | Rotated `AuthSession` |
| `signOut` | `auth.signout` | Bearer | `{ signout: true }` |
| `requestCode` | `auth.request_code` | Public | Code-request acknowledgement |
| `confirmCode` | `auth.confirm_code` | Public | `AuthSession` |
| `changePassword` | `auth.change_password` | Bearer | New `AuthSession` |
| `getAccount` | `user.get` | Bearer | `UserProfile` |
| `updateAccount` | `user.update` | Bearer | `UserProfile` |
| `createOAuthNonce` | `auth.nonce` | Public | `{ nonce: string }` |
| `startOAuth` | `auth.oauth_connect` | Public | OAuth redirect information |
| `completeOAuth` | `auth.oauth_signin` | Public | `AuthSession` |

"Public" means no bearer token is required. The URL access key, web API key, project availability, project auth settings, origin restrictions, operation validation, and rate limits still apply.

## Navigation contract

Every response that contains `next_action` also contains `next_operation`. The component library must use these fields together instead of guessing the next screen from the operation that just completed.

- `next_action` identifies the UI screen or state to open.
- `next_operation` identifies the API operation that the destination screen ultimately submits.
- A session response uses `next_action: null` and `next_operation: null`. This means authentication is complete; route to the host application's authenticated destination.
- `next_operation` is an RPC operation name, not a URL and not a component name.

```ts
type NextAction =
  | "SIGNIN"
  | "SIGNIN_WITH_CODE"
  | "ACCEPT_INVITE_WITH_CODE"
  | "RESET_PASSWORD_WITH_CODE"
  | "CHANGE_EMAIL_WITH_CODE"
  | "CHANGE_USERNAME_WITH_CODE"
  | null;

type NextOperation =
  | "auth.signin"
  | "auth.confirm_code"
  | null;

type NavigationHint = {
  next_action: NextAction;
  next_operation: NextOperation;
};
```

Use this routing table:

| `next_action` | Screen to open | `next_operation` | Screen behavior |
| --- | --- | --- | --- |
| `SIGNIN` | Password signin | `auth.signin` | Collect email and password, then submit signin |
| `SIGNIN_WITH_CODE` | Signin code or MFA | `auth.signin` | Request a `signin` code when needed, collect the required credentials and code, then submit signin |
| `ACCEPT_INVITE_WITH_CODE` | Accept invitation | `auth.signin` | Collect invite code and new password, then submit invite signin |
| `RESET_PASSWORD_WITH_CODE` | Reset password confirmation | `auth.confirm_code` | Collect the reset code and new password |
| `CHANGE_EMAIL_WITH_CODE` | Email change confirmation | `auth.confirm_code` | Collect the code and new email |
| `CHANGE_USERNAME_WITH_CODE` | Username change confirmation | `auth.confirm_code` | Collect the code and new username |
| `null` | Authenticated application | `null` | Close the auth flow and publish the new session |

The signup response always sets `next_operation` to `auth.signin`. Its `next_action` is `SIGNIN` or `SIGNIN_WITH_CODE`. A request-code response sets both fields according to its purpose. Any signin, refresh, code-confirmation, password-change, or OAuth-exchange response returns a session with both fields set to null.

## Auth settings

Call this once before rendering the auth UI. It tells the component library which methods and controls are available.

### Request

```json
{
  "operation": "auth.settings",
  "payload": {}
}
```

### Response data

```ts
type PasswordPolicy = {
  NAME: string;
  LENGTH: [number, number];
  SYMBOLS: boolean;
  NUMBERS: boolean;
  LOWERCASE: boolean;
  UPPERCASE: boolean;
};

type OAuthProviderSettings = {
  enabled: boolean;
  type: string;
  name: string;
  provider_name: string;
};

type AuthSettings = {
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
};
```

Example:

```json
{
  "enabled": false,
  "auth_settings": {
    "enabled": true,
    "allow_signin": true,
    "allow_signup": false,
    "identifier": ["email"],
    "signin_method": "password",
    "second_factor": "email_otp",
    "signup_verify_email": false,
    "account_update_verification": "email_otp",
    "password_policy": {
      "LENGTH": [8, 64],
      "LOWERCASE": false,
      "NAME": "MEDIUM",
      "NUMBERS": true,
      "SYMBOLS": true,
      "UPPERCASE": false
    }
  },
  "oauth_settings": {
    "enabled": false,
    "allow_signin": false,
    "allow_signup": false
  },
  "oauth_providers": {
    "facebook": {
      "enabled": false,
      "type": "client",
      "name": "facebook",
      "provider_name": "Facebook"
    },
    "github": {
      "enabled": false,
      "type": "client",
      "name": "github",
      "provider_name": "Github"
    },
    "google": {
      "enabled": false,
      "type": "client",
      "name": "google",
      "provider_name": "Google"
    },
    "linkedin": {
      "enabled": false,
      "type": "client",
      "name": "linkedin",
      "provider_name": "LinkedIn"
    }
  }
}
```

OAuth provider entries include both enabled and disabled providers. Provider credentials and secrets are never returned.

Use the settings in this order:

1. If top-level `enabled` is false, render a configurable unavailable state and do not offer auth actions.
2. Email authentication is available only when `auth_settings.enabled` is true.
3. Show signin only when `auth_settings.allow_signin` is true.
4. Show signup only when `auth_settings.allow_signup` is true.
5. Build identifier fields from `auth_settings.identifier`. This API currently documents email payloads, so generated components must support `email` and must not invent payload fields for unknown identifiers.
6. Use `auth_settings.signin_method` to choose the primary signin form.
7. If `auth_settings.second_factor` is `email_otp`, password signin requires both the password and a one-use signin code.
8. Use `signup_verify_email` and `account_update_verification` to select follow-up verification UI. Do not treat these values as proof that verification has completed.
9. OAuth is available only when `oauth_settings.enabled` is true. Filter `oauth_providers` to entries whose `enabled` value is true.
10. In signin mode, show OAuth only when `oauth_settings.allow_signin` is true. In signup mode, show it only when `oauth_settings.allow_signup` is true.

An `email_otp` second factor is MFA, not passwordless signin. The SDK and components should read these flags at runtime instead of assuming the example values.

## Signup

Creates an email and password account. Signup does not create a session.

### Payload

```ts
type SignUpInput = {
  email: string;                         // required
  password: string;                      // required, preserve exactly
  first_name: string;                    // required
  last_name: string;                     // required
  phone?: string;
  profile_photo?: string;
  metadata?: Record<string, unknown>;    // default: {}
  aud?: string;                          // default: "web"
};
```

Do not expose `roles` in the public SDK. Custom roles and non-default signup audiences are forbidden.

### Request

```json
{
  "operation": "auth.signup",
  "payload": {
    "email": "ada@example.com",
    "password": "correct horse battery staple",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "aud": "web"
  }
}
```

### Response data

```ts
type SignUpResult = {
  id: string;
  next_action: "SIGNIN" | "SIGNIN_WITH_CODE";
  next_operation: "auth.signin";
};
```

The response deliberately does not reveal whether the email was already registered. Do not use `id` to infer account creation or existence. Show the same completion message in both cases, then route using both `next_action` and `next_operation`.

## Signin

### Password signin

```ts
type PasswordSignInInput = {
  email: string;
  password: string;
  aud?: string;
  code?: string; // required when auth_settings.second_factor === "email_otp"
};
```

```json
{
  "operation": "auth.signin",
  "payload": {
    "email": "ada@example.com",
    "password": "correct horse battery staple",
    "aud": "web"
  }
}
```

When `auth_settings.second_factor` is `email_otp`, the client must first call `auth.request_code` with `purpose: "signin"`, then submit both `password` and `code` to `auth.signin`. If the code is absent, the server returns `CODE_REQUIRED`.

### Code signin

```ts
type CodeSignInInput = {
  email: string;
  grant_type: "code";
  code: string;
  aud?: string;
};
```

```json
{
  "operation": "auth.signin",
  "payload": {
    "email": "ada@example.com",
    "grant_type": "code",
    "code": "123456",
    "aud": "web"
  }
}
```

Code-only signin is supported when the project is not configured to require password-plus-OTP MFA. A code is one-use and purpose-bound.

Both signin forms return `AuthSession`.

## Request a code

Requests a six-digit, purpose-bound code by email. Codes expire after 10 minutes and are single-use.

### Payload

```ts
type CodePurpose =
  | "signin"
  | "invite"
  | "password_reset"
  | "email_change"
  | "username_change";

type RequestCodeInput = {
  email: string;
  purpose: CodePurpose;
  aud?: string;
};
```

### Response data

```ts
type RequestCodeResult = {
  accepted: true;
  purpose: CodePurpose;
  next_action:
    | "SIGNIN_WITH_CODE"
    | "ACCEPT_INVITE_WITH_CODE"
    | "RESET_PASSWORD_WITH_CODE"
    | "CHANGE_EMAIL_WITH_CODE"
    | "CHANGE_USERNAME_WITH_CODE";
  next_operation: "auth.signin" | "auth.confirm_code";
};
```

| Purpose | Next action | Submit the code to |
| --- | --- | --- |
| `signin` | `SIGNIN_WITH_CODE` | `auth.signin` |
| `invite` | `ACCEPT_INVITE_WITH_CODE` | `auth.signin` |
| `password_reset` | `RESET_PASSWORD_WITH_CODE` | `auth.confirm_code` |
| `email_change` | `CHANGE_EMAIL_WITH_CODE` | `auth.confirm_code` |
| `username_change` | `CHANGE_USERNAME_WITH_CODE` | `auth.confirm_code` |

The server always returns an accepted response, even when the account does not exist or is ineligible. The UI must always say something like “If an eligible account exists, a code has been sent.” Never display “email not found” based on this result.

## Reset password

This is a two-step public flow.

### Step 1 request the code

```json
{
  "operation": "auth.request_code",
  "payload": {
    "email": "ada@example.com",
    "purpose": "password_reset",
    "aud": "web"
  }
}
```

### Step 2 confirm the code and set the new password

```ts
type ResetPasswordInput = {
  email: string;
  code: string;
  new_password: string;
  aud?: string;
};
```

```json
{
  "operation": "auth.confirm_code",
  "payload": {
    "email": "ada@example.com",
    "purpose": "password_reset",
    "code": "123456",
    "new_password": "a new strong password",
    "aud": "web"
  }
}
```

Success returns `AuthSession`. It revokes older refresh sessions. Store the returned session as the current session.

## Accept an invitation

Invitation acceptance uses a code and creates the invited user's password.

### Step 1 request the invite code

```json
{
  "operation": "auth.request_code",
  "payload": {
    "email": "ada@example.com",
    "purpose": "invite",
    "aud": "web"
  }
}
```

### Step 2 accept the invitation

```ts
type AcceptInviteInput = {
  email: string;
  grant_type: "code";
  purpose: "invite";
  code: string;
  password: string;
  phone?: string;
  aud?: string;
};
```

Submit this input to `auth.signin`. Success returns `AuthSession`, sets the password, clears the invited state, and applies the optional profile fields.

## Refresh session

Refresh tokens rotate on every successful refresh and are single-use.

### Payload

```ts
type RefreshInput = {
  id_token: string;
  refresh_token: string;
  aud?: string;
};
```

The ID token may be expired, but it must still have a valid signature, issuer, audience, session ID, and matching live refresh-token record.

Success returns a complete replacement `AuthSession`. Atomically replace both stored tokens. Never keep using the old refresh token.

The SDK must use a single-flight refresh promise so simultaneous API failures do not race to reuse the same refresh token. For a protected request, it may refresh shortly before `token_info.exp`, or refresh once after an authentication failure and retry the original request once. It must not create an infinite retry loop.

If refresh fails, clear the local session and emit an unauthenticated state.

## Signout

### Request

Send the current ID token in the bearer header.

```json
{
  "operation": "auth.signout",
  "payload": {}
}
```

### Response data

```json
{ "signout": true }
```

Signout revokes all refresh sessions for the authenticated user, not only the current browser session. Clear local credentials whether the server call succeeds or fails.

## Get account information

Account information is a `user.*` operation, not an `auth.*` operation.

### Request

Send the current ID token in the bearer header.

```json
{
  "operation": "user.get",
  "payload": {}
}
```

Response data is `UserProfile`.

## Update account information

### Payload

```ts
type UpdateAccountInput = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_photo?: string;
  timezone?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
};
```

At least one field is required. Send the current ID token in the bearer header. Response data is the updated `UserProfile`.

This operation cannot change roles, claims, status, account ID, email, username, password, or password hashes. Use the dedicated flows below for email, username, and password changes.

## Change password while signed in

```ts
type ChangePasswordInput = {
  password: string;
  aud?: string;
};
```

Send this payload to `auth.change_password` with the current ID token in the bearer header. The current password is not required because the bearer session authorizes the change.

Success revokes older refresh sessions and returns a new `AuthSession`. Replace the stored session immediately.

## Change email

This flow proves access to the current email address. Use the account's current email in both steps.

1. Call `auth.request_code` with `purpose: "email_change"`.
2. Call `auth.confirm_code` with the current email, received code, and `new_email`.

```json
{
  "operation": "auth.confirm_code",
  "payload": {
    "email": "current@example.com",
    "purpose": "email_change",
    "code": "123456",
    "new_email": "new@example.com",
    "aud": "web"
  }
}
```

Success revokes older refresh sessions, returns a new `AuthSession`, and sets `email_verified_at` to null. Replace the stored session.

## Change username

This flow also proves access to the account email.

1. Call `auth.request_code` with `purpose: "username_change"`.
2. Call `auth.confirm_code` with the current email, received code, and `new_username`.

```json
{
  "operation": "auth.confirm_code",
  "payload": {
    "email": "ada@example.com",
    "purpose": "username_change",
    "code": "123456",
    "new_username": "ada",
    "aud": "web"
  }
}
```

Success revokes older refresh sessions and returns a new `AuthSession`.

## OAuth

OAuth uses a backend callback, PKCE, encrypted state, a client nonce, and a one-use access code. The frontend never receives provider access or refresh tokens.

### Supported intents

```ts
type OAuthIntent = "signin" | "signup" | "link";
```

Only render entries from `auth.settings.oauth_providers` whose `enabled` value is true. OAuth must also be enabled by `oauth_settings.enabled`. Use `oauth_settings.allow_signin` in signin mode and `oauth_settings.allow_signup` in signup mode.

### Step 1 create a nonce

```json
{
  "operation": "auth.nonce",
  "payload": {}
}
```

Response:

```json
{ "nonce": "..." }
```

The nonce is valid for about 10 minutes. Save it in memory or `sessionStorage` before navigating away.

### Step 2 create the provider authorization URL

```ts
type StartOAuthInput = {
  provider: string;
  nonce: string;                         // 32 to 512 chars
  intent?: "signin" | "signup" | "link"; // default: "signin"
  aud?: string;
  id_token?: string;                     // required for link
  refresh_token?: string;                // required for link
};
```

```json
{
  "operation": "auth.oauth_connect",
  "payload": {
    "provider": "google",
    "nonce": "the nonce from auth.nonce",
    "intent": "signin",
    "aud": "web"
  }
}
```

Response:

```ts
type OAuthConnectResult = {
  oauth_redirect_url: string;
  oauth_provider: string;
};
```

Navigate the browser or popup to `oauth_redirect_url`.

For `intent: "link"`, pass both tokens from the current session in the payload. Linking never happens by matching email automatically. A user must first sign in and intentionally start the link flow.

### Step 3 handle the configured frontend redirect

After the provider and backend callbacks complete, the configured frontend OAuth redirect URI receives one of:

```text
?access_code={one-use-code}
?error=oauth_denied
```

Do not log or persist `access_code`. Read it and exchange it immediately.

### Step 4 exchange the access code

```json
{
  "operation": "auth.oauth_signin",
  "payload": {
    "access_code": "code from the redirect query",
    "nonce": "the original client nonce",
    "aud": "web"
  }
}
```

The access code lasts about 60 seconds, is single-use, and must match the nonce. Success returns `AuthSession`. For a link intent, the provider is linked during this exchange and the returned session remains the active user's session.

Remove `access_code` or `error` from the browser URL after handling it.

## SDK requirements

Generate a client with a shape similar to:

```ts
type AuthClientOptions = {
  baseUrl: string;
  urlAccessKey: string;
  apiKey: string;
  audience?: string; // default: "web"
  storage?: AuthStorage;
  fetch?: typeof globalThis.fetch;
};

type AuthStorage = {
  get(): Promise<AuthSession | null> | AuthSession | null;
  set(session: AuthSession): Promise<void> | void;
  clear(): Promise<void> | void;
};
```

Required high-level methods:

```ts
getSettings(): Promise<AuthSettings>;
signUp(input: SignUpInput): Promise<SignUpResult>;
signIn(input: PasswordSignInInput | CodeSignInInput): Promise<AuthSession>;
requestCode(input: RequestCodeInput): Promise<RequestCodeResult>;
resetPassword(input: ResetPasswordInput): Promise<AuthSession>;
acceptInvite(input: AcceptInviteInput): Promise<AuthSession>;
refreshSession(): Promise<AuthSession>;
signOut(): Promise<void>;
getAccount(): Promise<UserProfile>;
updateAccount(input: UpdateAccountInput): Promise<UserProfile>;
changePassword(input: ChangePasswordInput): Promise<AuthSession>;
changeEmail(input: { email: string; code: string; new_email: string }): Promise<AuthSession>;
changeUsername(input: { email: string; code: string; new_username: string }): Promise<AuthSession>;
createOAuthNonce(): Promise<string>;
startOAuth(input: Omit<StartOAuthInput, "nonce">): Promise<OAuthConnectResult>;
completeOAuth(input: { access_code: string; nonce: string }): Promise<AuthSession>;
getSession(): Promise<AuthSession | null>;
subscribe(listener: (state: AuthState) => void): () => void;
```

`startOAuth` may create and retain the nonce internally. If it does, expose a separate advanced method that accepts an explicit nonce.

Recommended auth state:

```ts
type AuthState =
  | { status: "loading"; session: null; user: null }
  | { status: "authenticated"; session: AuthSession; user: UserProfile }
  | { status: "unauthenticated"; session: null; user: null }
  | { status: "error"; session: AuthSession | null; user: UserProfile | null; error: SinglebaseAuthError };
```

### Session behavior

- Initialize from the configured storage adapter and validate/refresh when needed.
- Keep one in-memory source of truth and notify subscribers after every state change.
- Preserve `next_action` and `next_operation` on method results and pass them to the UI navigation layer.
- Route from the returned navigation pair. Do not derive the next screen from the method name or hard-code a separate flow decision.
- Store a successful session after signin, reset, invite acceptance, password change, email change, username change, OAuth completion, and refresh.
- Treat `user.get` and `user.update` results as the current profile. Update the in-memory and stored `session.user_profile` copy without modifying the signed ID token.
- Make refresh single-flight across calls. Coordinate across browser tabs when persistent storage is used.
- Clear local state on failed refresh and after every signout attempt.
- Never decode an ID token as proof that a user is authenticated. The server verifies the live account and refresh record.
- Do not place tokens in URLs, logs, analytics, error reports, DOM attributes, or rendered HTML.
- Provide a pluggable storage interface. Document the XSS tradeoff if offering `localStorage`; prefer memory or a deliberate application-selected adapter by default.
- Never send the web API key as a bearer token. `X-API-Key` and `Authorization` have separate purposes.

### Request behavior

- Always use HTTPS outside local development.
- Apply the configured audience consistently.
- Preserve passwords exactly as entered.
- Normalize errors into `SinglebaseAuthError`.
- Support cancellation through `AbortSignal` on the low-level request API.
- Do not retry credential errors automatically.
- Apply limited backoff for transient network or `5xx` failures only. Respect `429` and prevent rapid code resend attempts.

## UI component requirements

The component library should be accessible, themeable, localization-ready, and usable independently or as one composed auth screen. Components receive an SDK client instance through context/provider or a property; they must not accept secret API credentials individually.

### Components

| Component | Purpose |
| --- | --- |
| `AuthProvider` | Own SDK state, initialization, subscriptions, and session transitions |
| `AuthGuard` | Render loading, authenticated, or signed-out content from auth state |
| `AuthScreen` | Route among signin, signup, recovery, invite, and OAuth callback views |
| `SignInForm` | Password signin and password-plus-code MFA |
| `CodeSignInForm` | Request and submit a signin code when code-only signin is available |
| `SignUpForm` | Create an account, then route using `next_action` and `next_operation` |
| `RequestCodeForm` | Shared email and resend UI for purpose-bound codes |
| `OtpCodeInput` | Accessible code input; submit one canonical string, not six unrelated values |
| `ResetPasswordForm` | Request reset code, confirm it, and set a new password |
| `AcceptInviteForm` | Request invite code, set initial password, and optionally capture profile fields |
| `AccountProfile` | Display `UserProfile` |
| `AccountProfileForm` | Update only fields supported by `user.update` |
| `ChangePasswordForm` | Authenticated password change and session replacement |
| `ChangeEmailForm` | Current-email code flow and new email input |
| `ChangeUsernameForm` | Email code flow and new username input |
| `OAuthButtons` | Render enabled providers and start signin or signup |
| `OAuthCallback` | Exchange `access_code`, handle denial, clean the URL, and restore navigation |
| `LinkedProviderButton` | Start the explicit authenticated provider-link flow |
| `SignOutButton` | Revoke server sessions and always clear local session state |

### Component states

Every form must support:

- idle, submitting, success, and error states;
- disabled controls while submitting;
- field-level validation plus a form-level server error;
- keyboard submission and a visible focus indicator;
- an `aria-live` status region for asynchronous results;
- safe, generic handling of unexpected errors;
- cancellable in-flight work when unmounted;
- configurable labels and messages without changing flow logic.

Code flows also need a resend state and countdown. A resend must call `auth.request_code` again. Do not imply that `accepted: true` proves delivery or account existence.

### Events

Expose callbacks or DOM custom events for at least:

```text
auth:ready
auth:signin
auth:signup
auth:session
auth:profile-update
auth:signout
auth:error
auth:navigate
```

Event details must never include passwords, codes, refresh tokens, ID tokens, OAuth access codes, or raw server responses containing credentials. A session event may indicate that state changed but must require consumers to read the session through the SDK.

### Styling and embedding

- Use Shadow DOM for custom elements unless the library deliberately provides unscoped primitives.
- Expose CSS custom properties and named parts for colors, typography, spacing, radii, inputs, buttons, alerts, and provider buttons.
- Do not inject global resets or global CSS.
- Make all forms responsive down to narrow mobile containers.
- Allow host applications to replace navigation and message rendering.
- Do not hard-code a router dependency.

## Flow state machines

### Password signin

```text
load settings
  -> enter email and password
  -> if password-plus-OTP is required, request signin code and collect code
  -> auth.signin
  -> store session
  -> authenticated
```

### Password reset

```text
enter email
  -> auth.request_code purpose=password_reset
  -> always show neutral delivery message
  -> enter code and new password
  -> auth.confirm_code
  -> replace session
  -> authenticated
```

### OAuth signin or signup

```text
create nonce
  -> auth.oauth_connect
  -> provider redirect
  -> backend callback
  -> frontend receives access_code
  -> auth.oauth_signin with original nonce
  -> clean callback URL
  -> store session
  -> authenticated
```

## Important error mappings

At minimum, map these server message codes:

| Code | Recommended UI behavior |
| --- | --- |
| `INVALID_PAYLOAD` | Highlight invalid fields when `details` identifies them |
| `INVALID_CREDENTIALS` | Show a generic credentials message |
| `CODE_REQUIRED` | Reveal or focus the code input |
| `INVALID_TOKEN` | Show an expired or invalid code/session message appropriate to the active flow |
| `INVALID_ID_TOKEN` | Attempt one refresh when possible; otherwise sign out locally |
| `INVALID_BEARER_TOKEN` | Attempt one refresh when possible; otherwise sign out locally |
| `INVALID_SESSION` | Clear the local session and ask the user to sign in |
| `INVALID_TOKEN_AUDIENCE` | Treat as SDK configuration/session corruption and clear the session |
| `REQUIRE_PASSWORD_CHANGE` | Route to password recovery or invitation completion |
| `INVALID_PASSWORD` | Show the project password requirements |
| `MISSING_PROFILE_DATA` | Require at least one changed profile field |
| `AUTH_RATE_LIMITED` | Disable rapid retries and show a retry-later message |
| `AUTH_DISABLED` | Render auth unavailable |
| `EMAIL_PROVIDER_DISABLED` | Hide email forms after settings reload |
| `EMAIL_SIGNUP_DISABLED` | Hide signup after settings reload |
| `OAUTH_DISABLED` | Hide OAuth controls after settings reload |
| `OAUTH_SIGNUP_DISABLED` | Remove OAuth from signup mode |
| `INVALID_OAUTH_PROVIDER` | Refresh settings and hide that provider |
| `INVALID_NONCE` | Restart the OAuth flow with a new nonce |
| `SIGN_IN_TO_LINK_PROVIDER` | Ask the user to sign in, then use explicit provider linking |
| `AUTHENTICATION_REQUIRED` | Route to signin |
| `UNAUTHORIZED_DOMAIN` | Show a configuration error to the integrator, not the end user |

Do not reveal whether an email address exists. Keep signin and recovery errors generic where a specific message would enable account enumeration.

## Acceptance criteria for generated code

- Uses `POST /api/{urlAccessKey}` and the RPC envelope for every documented operation.
- Sends the web key through `X-API-Key` and sends ID tokens only through the bearer header.
- Implements every operation and flow in this document without inventing unsupported endpoints or payload fields.
- Treats `user.get` and `user.update` as the account-info operations.
- Handles password-plus-OTP correctly when auth settings require it.
- Implements purpose-bound, single-use code flows and neutral request-code messaging.
- Routes screens using the returned `next_action` and `next_operation` pair, including the null/null authenticated state.
- Rotates and atomically stores both tokens, with single-flight refresh behavior.
- Replaces the active session after any successful operation returning `AuthSession`.
- Clears local session state after signout or unrecoverable refresh failure.
- Implements the complete OAuth nonce, redirect, access-code exchange, URL cleanup, and explicit linking flows.
- Does not leak credentials through events, logs, URLs, analytics, HTML, or error messages.
- Includes TypeScript types, unit tests for request construction and session races, and UI tests for each state transition.
- Includes accessible labels, focus management, keyboard operation, live status announcements, responsive layouts, and theme hooks.
- Keeps SDK transport/session logic separate from presentation components.

## Not supported by this API surface

Do not generate public SDK methods for deleting an account, listing sessions, signing out only one session, changing roles, editing claims, changing account status, administrative user management, phone verification, or unlinking an OAuth provider. Those operations are not part of the self-service auth and profile API documented here.
