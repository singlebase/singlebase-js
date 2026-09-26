import { fixture, html } from "@open-wc/testing";
import type { AuthState } from "@singlebase/singlebase-sdk";
import type { SinglebaseAuthScreen } from "../src/elements/authui.js";
import { createMockClient, makeSession, makeUserProfile } from "./mock-client.js";

export const SETTINGS = {
  enabled: true,
  auth_settings: {
    enabled: true,
    allow_signin: true,
    allow_signup: true,
    identifier: ["email"],
    signin_method: "password",
    second_factor: null,
    signup_verify_email: false,
    account_update_verification: null,
    password_policy: {
      NAME: "MEDIUM",
      LENGTH: [8, 64] as [number, number],
      SYMBOLS: false,
      NUMBERS: true,
      LOWERCASE: false,
      UPPERCASE: false
    }
  },
  oauth_settings: { enabled: true, allow_signin: true, allow_signup: true },
  oauth_providers: {
    google: { enabled: true, type: "client", name: "google", provider_name: "Google" },
    github: { enabled: true, type: "client", name: "github", provider_name: "GitHub" }
  }
};

/** An authenticated state carrying `profile`, for guard and interstitial tests. */
export function authedState(profile = makeUserProfile()): AuthState {
  return {
    status: "authenticated",
    session: makeSession({ user_profile: profile }),
    user: profile
  };
}

export function signedOutClient() {
  return createMockClient();
}

export function signedInClient(profile = makeUserProfile()) {
  return createMockClient(authedState(profile));
}

export async function mountWidget(attrs: Record<string, unknown> = {}, client = signedOutClient()) {
  const el = await fixture<SinglebaseAuthScreen>(
    html`<singlebase-authui .client=${client} .settings=${SETTINGS as never}></singlebase-authui>`
  );
  Object.assign(el, attrs);
  await el.updateComplete;
  return { el, client };
}

export const textOf = (el: HTMLElement) => el.shadowRoot?.textContent ?? "";
