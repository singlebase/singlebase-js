/**
 * Default UI copy, taken verbatim from the design mock's renderVals()
 * (titles/subs/ctas maps and inline strings in project/AuthWidget.dc.html).
 * Every element accepts a .messages property with a partial override of
 * this shape — spec: "configurable labels and messages without changing flow
 * logic". This is deliberately a flat string bag rather than a locale-file
 * system; hosts needing full i18n supply one populated object per language.
 */
export interface SinglebaseAuthMessages {
  // titles
  signInTitle: string;
  signUpTitle: string;
  forgotTitle: string;
  verifyTitle: string;
  otpTitle: string;
  newPassTitle: string;
  inviteTitle: string;

  // subtitles
  signInSubEmailAndOauth: string;
  signInSubEmailOnly: string;
  signInSubOauthOnly: string;
  signUpSub: string;
  forgotSub: string;
  otpSub: string;
  inviteSub: string;

  // ctas
  signInCta: string;
  signUpCta: string;
  forgotCta: string;
  verifyCta: string;
  otpCta: string;
  newPassCta: string;
  inviteCta: string;
  continueCta: string;
  backCta: string;

  // accordion
  emailMethodTitle: string;
  emailMethodTitleSignUp: string;
  emailMethodMeta: string;
  emailMethodMetaSignUp: string;
  emailMethodMetaOtp: string;
  oauthMethodTitle: string;
  oauthMethodMeta: string;

  // fields
  fullNameLabel: string;
  fullNamePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  newPasswordLabel: string;
  newPasswordPlaceholder: string;
  confirmPasswordLabel: string;
  confirmPasswordPlaceholder: string;
  currentPasswordLabel: string;
  firstNameLabel: string;
  firstNamePlaceholder: string;
  lastNameLabel: string;
  lastNamePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  invitedEmailLabel: string;

  // links / affordances
  forgotLink: string;
  otpInsteadLink: string;
  footTextSignIn: string;
  footActionSignIn: string;
  footTextSignUp: string;
  footActionSignUp: string;
  resendQuestion: string;
  resendCta: string;
  oauthPrimaryLabel: string;
  oauthContinueWith: string;

  // blocked
  blockedTitleDisabled: string;
  blockedTitleUnavailable: string;
  blockedBodyDisabled: string;
  blockedBodyUnavailable: string;
  blockedHint: string;

  // account
  signOutCta: string;
  addPhotoLink: string;
  changePhotoLink: string;
  photoUploading: string;
  photoUpdated: string;
  editingLabel: string;
  uploadPhotoCta: string;
  replacePhotoCta: string;
  photoHint: string;
  doneCta: string;
  cancelCta: string;
  editAccountCta: string;
  saveChangesCta: string;
  emailChangeHint: string;
  passwordSectionTitle: string;
  passwordChangedHint: string;
  changePasswordCta: string;
  updatePasswordCta: string;
  twoFaTitle: string;
  twoFaHintOff: string;
  twoFaHintOn: string;
  twoFaScanHint: string;
  connectedTitle: string;
  connectedHint: string;
  addAnotherLabel: string;
  disconnectCta: string;
  notConnectedLabel: string;
  deleteAccountCta: string;
  deleteAccountConfirmCta: string;
  deletePanelBody: string;
  deleteConfirmLabel: string;
  deleteConfirmPlaceholder: string;
  savedNote: string;
  passwordUpdatedNote: string;

  // standalone change-email / change-username forms
  changeEmailTitle: string;
  newEmailLabel: string;
  changeEmailCta: string;
  changeUsernameTitle: string;
  newUsernameLabel: string;
  changeUsernameCta: string;

  // generic async / errors
  genericErrorMessage: string;
  rateLimitedMessage: string;
  codeSentNeutral: string;
  invalidEmailError: string;
  requiredError: string;
  passwordMinError: string;
  passwordMatchError: string;
  codeIncompleteError: string;
  invalidPhoneError: string;
  notYetSupported: string;

  // already-signed-in interstitial
  alreadySignedInTitle: string;
  alreadySignedInSub: string;
  alreadySignedInSubPrefix: string;
  continueHint: string;

  // consent line
  consentPrefix: string;
  consentJoin: string;
  termsLabel: string;
  privacyLabel: string;

  emailUnchangedError: string;
  emailUpdatedNote: string;
  changeEmailCtaShort: string;
  changeEmailHint: string;
  changeEmailConfirmHint: string;
  changeEmailElsewhereHint: string;
  confirmChangeCta: string;
  codeLabel: string;
  /** The credit under the card. A brand name — translate only the "Auth by". */
  brandingLabel: string;

  // provider linking
  linkRequiresSignIn: string;

  // oauth callback screen
  oauthCallbackTitle: string;
  oauthCallbackSub: string;
  oauthDenied: string;
}

export const defaultMessages: SinglebaseAuthMessages = {
  signInTitle: "Sign in",
  signUpTitle: "Create your account",
  forgotTitle: "Reset your password",
  verifyTitle: "Enter your code",
  otpTitle: "Sign in with a code",
  newPassTitle: "Choose a new password",
  inviteTitle: "You have been invited",

  signInSubEmailAndOauth: "Use your email or a connected provider.",
  signInSubEmailOnly: "Use your email address and password.",
  signInSubOauthOnly: "Continue with a connected provider.",
  signUpSub: "Free to start. No card required.",
  forgotSub: "We will email you a six-digit code to confirm it is you.",
  otpSub: "No password needed — we will email you a six-digit code.",
  inviteSub: "Set up your account to continue.",

  signInCta: "Sign in",
  signUpCta: "Create account",
  forgotCta: "Send code",
  verifyCta: "Verify code",
  otpCta: "Email me a code",
  newPassCta: "Save password",
  inviteCta: "Create account",
  continueCta: "Continue",
  backCta: "Back",

  emailMethodTitle: "Email",
  emailMethodTitleSignUp: "Email and password",
  emailMethodMeta: "Password or one-time code",
  emailMethodMetaSignUp: "Create with an address",
  emailMethodMetaOtp: "One-time code",
  oauthMethodTitle: "Single sign-on",
  oauthMethodMeta: "Google, GitHub, and more",

  fullNameLabel: "Full name",
  fullNamePlaceholder: "Ada Lovelace",
  emailLabel: "Email",
  emailPlaceholder: "you@company.com",
  passwordLabel: "Password",
  passwordPlaceholder: "••••••••",
  newPasswordLabel: "New password",
  newPasswordPlaceholder: "At least 10 characters",
  confirmPasswordLabel: "Confirm password",
  confirmPasswordPlaceholder: "Repeat it",
  currentPasswordLabel: "Current password",
  firstNameLabel: "First name",
  firstNamePlaceholder: "Ada",
  lastNameLabel: "Last name",
  lastNamePlaceholder: "Lovelace",
  phoneLabel: "Phone number",
  phonePlaceholder: "+1 (555) 000-0000",
  invitedEmailLabel: "Invited email",

  forgotLink: "Forgot?",
  otpInsteadLink: "Email me a one-time code instead",
  footTextSignIn: "New here?",
  footActionSignIn: "Create an account",
  footTextSignUp: "Already have an account?",
  footActionSignUp: "Sign in",
  resendQuestion: "Did not get it?",
  resendCta: "Resend code",
  oauthPrimaryLabel: "Continue with Google",
  oauthContinueWith: "Continue with",

  blockedTitleDisabled: "Sign-in is turned off",
  blockedTitleUnavailable: "Sign-in unavailable",
  blockedBodyDisabled: "Authentication is currently disabled for this application.",
  blockedBodyUnavailable: "No sign-in methods are enabled for this application.",
  blockedHint: "Contact the site owner if you think this is a mistake.",

  signOutCta: "Sign out",
  addPhotoLink: "Add photo",
  changePhotoLink: "Change",
  photoUploading: "Uploading…",
  photoUpdated: "Photo updated",
  editingLabel: "Editing",
  uploadPhotoCta: "Upload photo",
  replacePhotoCta: "Replace photo",
  photoHint: "PNG or JPG, up to 2 MB.",
  doneCta: "Done",
  cancelCta: "Cancel",
  editAccountCta: "Edit account",
  saveChangesCta: "Save changes",
  emailChangeHint: "We will send a verification link to the new address.",
  passwordSectionTitle: "Password",
  passwordChangedHint: "Last changed three months ago.",
  changePasswordCta: "Change password",
  updatePasswordCta: "Update password",
  twoFaTitle: "Two-factor authentication",
  twoFaHintOff: "Add a second step when signing in.",
  twoFaHintOn: "Enabled with an authenticator app.",
  twoFaScanHint: "Scan with your authenticator app, then enter the 6-digit code.",
  connectedTitle: "Connected accounts",
  connectedHint: "Sign in with any provider you connect here.",
  addAnotherLabel: "Add another",
  disconnectCta: "Disconnect",
  notConnectedLabel: "Not connected",
  deleteAccountCta: "Delete account",
  deleteAccountConfirmCta: "Permanently delete account",
  deletePanelBody:
    "This removes your profile, sessions and connected providers. It cannot be undone.",
  deleteConfirmLabel: "Type DELETE to confirm",
  deleteConfirmPlaceholder: "DELETE",
  savedNote: "Saved",
  passwordUpdatedNote: "Password updated",

  changeEmailTitle: "Email",
  newEmailLabel: "New email",
  changeEmailCta: "Send verification code",
  changeUsernameTitle: "Username",
  newUsernameLabel: "New username",
  changeUsernameCta: "Send verification code",

  genericErrorMessage: "Something went wrong. Please try again.",
  rateLimitedMessage: "Too many attempts. Try again in 5 minutes or reset your password.",
  codeSentNeutral: "If an eligible account exists, a code has been sent.",
  invalidEmailError: "Enter a valid email address.",
  requiredError: "This cannot be empty.",
  passwordMinError: "Use at least 10 characters.",
  passwordMatchError: "Both passwords must match.",
  codeIncompleteError: "Enter all six digits.",
  invalidPhoneError: "Enter a valid phone number.",
  notYetSupported: "Not yet supported",

  alreadySignedInTitle: "You are already signed in",
  alreadySignedInSub: "Continue where you left off, or sign out to use another account.",
  alreadySignedInSubPrefix: "Signed in as",
  continueHint: "Continuing takes you to your account.",

  consentPrefix: "By continuing you agree to our",
  consentJoin: "and",
  termsLabel: "Terms",
  privacyLabel: "Privacy Policy",

  emailUnchangedError: "That is already your email address.",
  emailUpdatedNote: "Email updated",
  changeEmailCtaShort: "Change email",
  changeEmailHint: "We will send a code to your current address to confirm it is you.",
  changeEmailConfirmHint: "Enter the code we sent, and your email becomes",
  changeEmailElsewhereHint: "Your email is changed below, with a verification step.",
  confirmChangeCta: "Confirm change",
  codeLabel: "Verification code",
  brandingLabel: "Auth by Singlebase",
  linkRequiresSignIn: "Sign in first, then link a provider.",

  oauthCallbackTitle: "Finishing sign-in",
  oauthCallbackSub: "One moment while we complete your sign-in.",
  oauthDenied: "Sign-in was cancelled or denied."
};

export function resolveMessages(
  overrides?: Partial<SinglebaseAuthMessages>
): SinglebaseAuthMessages {
  return overrides ? { ...defaultMessages, ...overrides } : defaultMessages;
}
