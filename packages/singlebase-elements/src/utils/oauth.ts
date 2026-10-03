import type { AuthSettings, OAuthIntent, OAuthProviderName } from "@singlebase/singlebase-sdk";

export interface OAuthProviderOption {
  id: OAuthProviderName;
  /** The project's `provider_name`, never a hard-coded label. */
  name: string;
  /** A short mark for the button. */
  mark: string;
}

/** Where a link flow remembers its provider across the redirect. */
export const linkStorageKey = (nonceKey: string) => `${nonceKey}:link`;

const MARKS: Record<string, string> = { google: "G", github: "GH", linkedin: "in", facebook: "f" };

/** OAuth is usable only when it's on and the project has a frontend return URL. */
export function oauthReady(settings: AuthSettings | null | undefined): boolean {
  const o = settings?.oauth_settings;
  return !!o?.enabled && !!o.redirect_url?.trim();
}

/**
 * The intent to send for a sign-in button. The service's `signup` intent signs
 * an existing account in and creates one for a new person, while `signin`
 * refuses anyone it doesn't know. So when the project allows OAuth sign-up, a
 * sign-in button uses `signup` and first-time visitors aren't turned away.
 */
export function startIntent(
  settings: AuthSettings | null | undefined,
  intent: OAuthIntent
): OAuthIntent {
  return intent === "signin" && settings?.oauth_settings.allow_signup ? "signup" : intent;
}

/**
 * The enabled providers for an intent. Sign-in and sign-up also follow the
 * project's `allow_signin` / `allow_signup`; linking only needs OAuth on.
 */
export function oauthProviders(
  settings: AuthSettings | null | undefined,
  intent: OAuthIntent
): OAuthProviderOption[] {
  if (!settings || !oauthReady(settings)) return [];
  const o = settings.oauth_settings;
  if (intent === "signin" && !o.allow_signin) return [];
  if (intent === "signup" && !o.allow_signup) return [];

  return Object.entries(settings.oauth_providers ?? {})
    .filter(([, p]) => p.enabled)
    .map(([id, p]) => ({
      id: id as OAuthProviderName,
      name: p.provider_name,
      mark: MARKS[id] ?? p.provider_name.slice(0, 2)
    }));
}
