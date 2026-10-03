import { html, nothing } from "lit";
import type { PasswordPolicy } from "@singlebase/singlebase-sdk";
import type { SinglebaseAuthMessages } from "../messages.js";

/** The placeholder for a new-password field: the policy's minimum, when known. */
export function newPasswordPlaceholder(
  policy: PasswordPolicy | null | undefined,
  msg: SinglebaseAuthMessages
): string {
  const min = policy?.LENGTH?.[0];
  return min
    ? msg.newPasswordPlaceholder.replace("{min}", String(min))
    : msg.newPasswordPlaceholderPlain;
}

/**
 * Checks a new password against the project's `password_policy` and returns
 * the first rule it breaks, or "" when it passes. Without a policy (settings
 * not loaded yet) nothing is checked here and the server decides.
 */
export function passwordError(
  password: string,
  policy: PasswordPolicy | null | undefined,
  msg: SinglebaseAuthMessages
): string {
  if (!password) return msg.requiredError;
  if (!policy) return "";

  const [min, max] = policy.LENGTH ?? [0, 0];
  if (min && password.length < min) return msg.passwordTooShortError.replace("{min}", String(min));
  if (max && password.length > max) return msg.passwordTooLongError.replace("{max}", String(max));
  if (policy.LOWERCASE && !/[a-z]/.test(password)) return msg.passwordNeedsLowercaseError;
  if (policy.UPPERCASE && !/[A-Z]/.test(password)) return msg.passwordNeedsUppercaseError;
  if (policy.NUMBERS && !/\d/.test(password)) return msg.passwordNeedsNumberError;
  if (policy.SYMBOLS && !/[^A-Za-z0-9\s]/.test(password)) return msg.passwordNeedsSymbolError;
  return "";
}

interface PasswordRule {
  label: string;
}

/** The policy's rules as readable labels. */
function passwordRules(
  policy: PasswordPolicy | null | undefined,
  msg: SinglebaseAuthMessages
): PasswordRule[] {
  if (!policy) return [];
  const [min, max] = policy.LENGTH ?? [0, 0];
  const rules: PasswordRule[] = [];
  if (min || max) {
    const label = max
      ? msg.passwordRuleLength.replace("{min}", String(min || 1)).replace("{max}", String(max))
      : msg.passwordRuleMinLength.replace("{min}", String(min));
    rules.push({ label });
  }
  if (policy.LOWERCASE) rules.push({ label: msg.passwordRuleLowercase });
  if (policy.UPPERCASE) rules.push({ label: msg.passwordRuleUppercase });
  if (policy.NUMBERS) rules.push({ label: msg.passwordRuleNumber });
  if (policy.SYMBOLS) rules.push({ label: msg.passwordRuleSymbol });
  return rules;
}

/**
 * The policy's requirements as a small hint under a new-password field,
 * closed until opened. It only lists the rules; validation stays on submit.
 */
export function renderPasswordRules(
  policy: PasswordPolicy | null | undefined,
  msg: SinglebaseAuthMessages
) {
  const rules = passwordRules(policy, msg);
  if (rules.length === 0) return nothing;
  return html`<details class="pw-rules" part="password-rules">
    <summary>${msg.passwordRulesLabel}</summary>
    <ul>
      ${rules.map((rule) => html`<li>${rule.label}</li>`)}
    </ul>
  </details>`;
}
