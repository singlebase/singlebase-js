# Changelog

All three packages (`@singlebase/core`, `@singlebase/singlebase-sdk`,
`@singlebase/elements`) share one version.

## Unreleased

Aligns the auth SDK and UI with the updated auth API, and turns on the chat's
service-side features.

### Breaking

- **Passwords follow the project's `password_policy`.** Sign-up, password
  reset, invites and the account view check the policy's length and character
  rules instead of fixed minimums (8 or 10). Sign-in no longer checks length.
  The `passwordMinError` message is replaced by `passwordTooShortError`,
  `passwordTooLongError`, `passwordNeedsLowercaseError`,
  `passwordNeedsUppercaseError`, `passwordNeedsNumberError` and
  `passwordNeedsSymbolError`.
- **`<singlebase-chat>` keeps attached files on the chat by default.**
  `attachments-mode` now defaults to `payload`. Set
  `attachments-mode="retrieval"` for the old one-message behaviour. Retrieval
  entries the chat builds use `source` instead of `type`.
- **OAuth shows only when the project has a return URL**
  (`oauth_settings.redirect_url`), and **Forgot password only when recovery is
  by email code** (`password_recovery_verification: "email_otp"`).
- **Only first name is required.** Sign-up no longer sends a placeholder last
  name, and invites and the account view accept an empty last name and phone.
  The account view sends only the fields that changed.
- **The OAuth return is detected only by `?access_code=` or
  `?error=oauth_denied`.** Other `?error=` values are left for your page.
- **The account view no longer asks for the current password.** The API never
  received it; the session authorizes the change, and people who signed up
  with OAuth have no current password. `currentPasswordLabel` is removed from
  `messages`.
- **Sign-in OAuth buttons use the `signup` intent when the project allows OAuth
  sign-up**, so first-time visitors get an account instead of an error.
- **Removed messages:** `oauthPrimaryLabel` (unused).
- **Removed `authui` config keys:** `brandingText` and `brandingUrl`, which have
  done nothing since 0.7.0.

### Added

- `auth.startOAuth()` returns the `nonce` it used, so `completeOAuth()` can
  always finish the flow.
- SDK types: `OAuthProviderName`, `StartOAuthResult`,
  `auth_settings.password_recovery_verification` and
  `oauth_settings.redirect_url`. `SignUpInput.last_name` is optional.
- Error hints for `OAUTH_SIGNIN_DISABLED`, `MISSING_OAUTH_CREDENTIALS`,
  `OAUTH_VERIFICATION_FAILED` and `VERIFIED_PROVIDER_EMAIL_REQUIRED`, with
  matching UI messages.
- Provider labels come from each provider's `provider_name`.
- Every visible string in the auth elements can be changed through `messages`.
- Fields that create a password have a "Password requirements" hint, closed by
  default, listing the project's policy (`::part(password-rules)`).
- The widget reads `?oauth_error=<CODE>` on the OAuth return and explains it
  (`SIGN_IN_TO_LINK_PROVIDER`, `PROVIDER_ALREADY_LINKED`,
  `VERIFIED_PROVIDER_EMAIL_REQUIRED`, …). Text from the URL is never shown.
- Connecting a provider while signed in now reports the result on the account
  view ("GitHub is now connected", or the error). `SIGN_IN_TO_LINK_PROVIDER`
  explains that the person should sign in first and then connect the provider.

### Changed

- Fixed: the stepped sign-up (`stepped`) couldn't get past its first step,
  because it checked the email while only the name was showing.
- Sign-up checks the name before the password, in the order the fields appear.

- A wrong password no longer shows "Too many attempts" after three tries. Only
  the server's `AUTH_RATE_LIMITED` does.
- `rateLimitedMessage` and `oauthMethodMeta` have new default text.
- New-password placeholders show the policy's minimum: `newPasswordPlaceholder`
  is now `"At least {min} characters"`, and `newPasswordPlaceholderPlain` is
  used before the settings load. Sign-up's password field uses it too.

## 0.7.0

### Breaking

- The "… by Singlebase" credit is fixed: `branding-text`, `branding-url` and
  `messages.brandingLabel` are removed. `branding="false"` still hides it.
- The guides moved from `SBC-*.md` to `docs/`.
