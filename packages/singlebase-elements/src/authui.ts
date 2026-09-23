/**
 * `@singlebase/elements/authui` — the authentication elements on their own:
 * <singlebase-authui>, <singlebase-authui-guard>, <singlebase-authui-buttons>
 * and <singlebase-authui-display>. Importing it registers them.
 */
export { SinglebaseAuthScreen } from "./elements/auth-screen.js";
export type { Screen, GuestScreen, ProtectedScreen } from "./elements/auth-screen.js";
export { isScreen, isGuestScreen, isProtectedScreen } from "./elements/auth-screen.js";

export { SinglebaseAuthGuard } from "./elements/guard.js";
export type { GuardState } from "./elements/guard.js";

export { SinglebaseAuthButtons } from "./elements/buttons.js";
export type { ButtonsType } from "./elements/buttons.js";

export { SinglebaseAuthDisplay } from "./elements/display.js";

// Composed by <singlebase-authui> for the account screen. Registers its own tag
// because the widget renders it in a template; not part of the documented surface.
export { SinglebaseAccountScreen } from "./elements/account-screen.js";

export { AuthController } from "./controllers/auth-controller.js";
export { SettingsController } from "./controllers/settings-controller.js";
export { defaultMessages, resolveMessages } from "./messages.js";
export type { SinglebaseAuthMessages } from "./messages.js";
export { fullNameOf, initialsOf } from "./utils/profile.js";
export { resolveRedirectTarget } from "./utils/redirect.js";

// The predicate vocabulary <singlebase-authui-guard> filters with.
export { matchesPredicate, validatePredicate, OPERATORS } from "@singlebase/core";
export type { Predicate, Operator } from "@singlebase/core";
