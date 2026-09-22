export { AuthController } from "./controllers/auth-controller.js";
export { SettingsController } from "./controllers/settings-controller.js";
export { defaultMessages, resolveMessages } from "./messages.js";
export type { SinglebaseAuthMessages } from "./messages.js";
export { fullNameOf, initialsOf } from "./utils/profile.js";

// ── the public tags ───────────────────────────────────────
export { SinglebaseAuthScreen } from "./elements/auth-screen.js";
export type { Screen, GuestScreen, ProtectedScreen } from "./elements/auth-screen.js";
export { isScreen, isGuestScreen, isProtectedScreen } from "./elements/auth-screen.js";

export { SinglebaseAuthGuard } from "./elements/guard.js";
export type { GuardState } from "./elements/guard.js";

export { SinglebaseAuthButtons } from "./elements/buttons.js";
export type { ButtonsType } from "./elements/buttons.js";

export { SinglebaseAuthDisplay } from "./elements/display.js";

// ── composed by <singlebase-authui>, not part of the documented surface ──
// Registers its own tag because the base widget renders it in a template;
// implementation detail, and may change name or disappear.
export { SinglebaseAccountScreen } from "./elements/account-screen.js";

// The predicate vocabulary <singlebase-authui-guard> filters with.
export { matchesPredicate, validatePredicate, OPERATORS } from "@singlebase/core";
export type { Predicate, Operator } from "@singlebase/core";
export { resolveRedirectTarget } from "./utils/redirect.js";
