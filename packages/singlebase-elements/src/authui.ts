/**
 * `@singlebase/elements/authui` — the authentication elements on their own:
 * <singlebase-authui>, <singlebase-authui-guard>, <singlebase-authui-buttons>
 * and <singlebase-authui-display>. Importing it registers them.
 */
export { SinglebaseAuthScreen } from "./elements/authui.js";
export type { Screen, GuestScreen, ProtectedScreen } from "./elements/authui.js";
export { isScreen, isGuestScreen, isProtectedScreen } from "./elements/authui.js";

export { SinglebaseAuthGuard } from "./elements/authui-guard.js";
export type { GuardState } from "./elements/authui-guard.js";

export { SinglebaseAuthButtons } from "./elements/authui-buttons.js";
export type { ButtonsType } from "./elements/authui-buttons.js";

export { SinglebaseAuthDisplay } from "./elements/authui-display.js";

// Composed by <singlebase-authui> for the account screen. Registers its own tag
// because the widget renders it in a template; not part of the documented surface.
export { SinglebaseAccountScreen } from "./elements/authui-account.js";

export { AuthController } from "./controllers/auth-controller.js";
export { SettingsController } from "./controllers/settings-controller.js";
export { defaultMessages, resolveMessages } from "./messages.js";
export type { SinglebaseAuthMessages } from "./messages.js";
export { fullNameOf, initialsOf } from "./utils/profile.js";
export { resolveRedirectTarget } from "./utils/redirect.js";

// The predicate vocabulary <singlebase-authui-guard> filters with.
export { matchesPredicate, validatePredicate, OPERATORS } from "@singlebase/core";
export type { Predicate, Operator } from "@singlebase/core";
