import { expect, aTimeout, fixture, html } from "@open-wc/testing";
import { SinglebaseAuthError } from "@singlebase/singlebase-sdk";
import "../src/elements/authui.js";
import "../src/elements/authui-account.js";
import type { SinglebaseAuthScreen } from "../src/elements/authui.js";
import type { SinglebaseAccountScreen } from "../src/elements/authui-account.js";
import {
  SETTINGS,
  authedState,
  mountWidget,
  signedInClient,
  signedOutClient,
  textOf
} from "./fixtures.js";

/** SETTINGS with some auth_settings / oauth_settings overridden. */
const settingsWith = (auth: object = {}, oauth: object = {}) => ({
  ...SETTINGS,
  auth_settings: { ...SETTINGS.auth_settings, ...auth },
  oauth_settings: { ...SETTINGS.oauth_settings, ...oauth }
});

const settle = async (el: { updateComplete: Promise<unknown> }) => {
  await aTimeout(0);
  await el.updateComplete;
};

const type = async (
  el: HTMLElement & { updateComplete: Promise<unknown> },
  id: string,
  value: string
) => {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(`input[id$="${id}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await el.updateComplete;
};

const submit = async (el: SinglebaseAuthScreen) => {
  el.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await settle(el);
};

const oauthButtons = (el: SinglebaseAuthScreen) =>
  el.shadowRoot!.querySelector("singlebase-authui-buttons");

describe("OAuth follows the project settings", () => {
  it("is hidden when the project has no frontend return URL", async () => {
    const { el } = await mountWidget({ settings: settingsWith({}, { redirect_url: null }) });
    expect(oauthButtons(el)).to.not.exist;
    expect(textOf(el)).to.not.include("Single sign-on");
  });

  it("names the providers from their provider_name", async () => {
    const { el } = await mountWidget();
    expect(textOf(el)).to.include("Google, GitHub");
  });

  it("follows allow_signup on the signup screen only", async () => {
    const settings = settingsWith({}, { allow_signup: false });
    const { el: signup } = await mountWidget({ settings, screen: "signup" });
    expect(oauthButtons(signup)).to.not.exist;

    const { el: signin } = await mountWidget({ settings });
    expect(oauthButtons(signin)).to.exist;
  });
});

describe("password recovery follows the project settings", () => {
  it("offers Forgot? when recovery is by email code", async () => {
    const { el } = await mountWidget();
    expect(textOf(el)).to.include("Forgot");
  });

  it("hides Forgot? and the recovery screen otherwise", async () => {
    const { el } = await mountWidget({
      settings: settingsWith({ password_recovery_verification: null })
    });
    expect(textOf(el)).to.not.include("Forgot");

    el.goto("forgot");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('input[id$="reset"]')).to.not.exist;
  });
});

describe("only first name is required", () => {
  it("signs up with a single name and sends no last name", async () => {
    const client = signedOutClient();
    let sent: Record<string, unknown> | undefined;
    client.signUp = async (input: never) => {
      sent = input;
      return { id: "u1", next_action: "SIGNIN", next_operation: "auth.signin" } as never;
    };
    const { el } = await mountWidget({ screen: "signup" }, client);
    await type(el, "name", "Ada");
    await type(el, "email", "ada@example.com");
    await type(el, "pass", "correct horse battery 9");
    await submit(el);

    expect(sent).to.deep.equal({
      email: "ada@example.com",
      password: "correct horse battery 9",
      first_name: "Ada"
    });
  });

  it("asks for a first name before signing up", async () => {
    const client = signedOutClient();
    let called = false;
    client.signUp = async () => {
      called = true;
      return {} as never;
    };
    const { el } = await mountWidget({ screen: "signup" }, client);
    await type(el, "email", "ada@example.com");
    await type(el, "pass", "correct horse battery 9");
    await submit(el);

    expect(called).to.be.false;
    expect(textOf(el)).to.include("Enter your first name.");
  });

  it("accepts an invite without names or a phone", async () => {
    const client = signedOutClient();
    let sent: Record<string, unknown> | undefined;
    client.acceptInvite = async (input: never) => {
      sent = input;
      return {} as never;
    };
    const { el } = await mountWidget(
      { screen: "invite", inviteEmail: "ada@example.com", inviteCode: "123456" },
      client
    );
    await type(el, "invitepass", "correct horse battery 9");
    await submit(el);

    expect(sent).to.exist;
    expect(sent).to.not.have.property("phone");
    expect(client.calls.updateAccount).to.equal(undefined);
  });

  it("saves names typed on the invite screen to the new account", async () => {
    const client = signedOutClient();
    let saved: unknown;
    client.acceptInvite = async () => ({}) as never;
    client.updateAccount = async (input: never) => {
      saved = input;
      return {} as never;
    };
    const { el } = await mountWidget(
      { screen: "invite", inviteEmail: "ada@example.com", inviteCode: "123456" },
      client
    );
    await type(el, "first", "Ada");
    await type(el, "invitepass", "correct horse battery 9");
    await submit(el);

    expect(saved).to.deep.equal({ first_name: "Ada" });
  });
});

describe("account — saving the profile", () => {
  async function editProfile() {
    const client = signedInClient();
    let saved: unknown;
    client.updateAccount = async (input: never) => {
      saved = input;
      return {} as never;
    };
    const el = await fixture<SinglebaseAccountScreen>(
      html`<singlebase-authui-account></singlebase-authui-account>`
    );
    el.client = client as never;
    el.settings = SETTINGS as never;
    await el.updateComplete;
    const button = (text: string) =>
      [...el.shadowRoot!.querySelectorAll("button")].find((b) => b.textContent!.includes(text))!;
    button("Edit account").click();
    await el.updateComplete;
    return { el, button, saved: () => saved };
  }

  it("saves without a phone, sending only what changed", async () => {
    const { el, button, saved } = await editProfile();
    await type(el, "last", "Byron");
    button("Save changes").click();
    await settle(el);

    expect(saved()).to.deep.equal({ last_name: "Byron" });
    expect(el.shadowRoot!.textContent).to.not.include("valid phone");
  });

  it("still needs a first name", async () => {
    const { el, button, saved } = await editProfile();
    await type(el, "first", "");
    button("Save changes").click();
    await settle(el);

    expect(saved()).to.equal(undefined);
    expect(el.shadowRoot!.textContent).to.include("Enter your first name.");
  });

  it("makes no call when nothing changed", async () => {
    const { el, button, saved } = await editProfile();
    button("Save changes").click();
    await settle(el);
    expect(saved()).to.equal(undefined);
  });
});

describe("OAuth errors", () => {
  const originalUrl = globalThis.location.href;
  afterEach(() => history.replaceState({}, "", originalUrl));

  it("explains when the provider email isn't verified", async () => {
    history.replaceState({}, "", `${location.pathname}?access_code=abc`);
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");
    const client = signedOutClient();
    client.completeOAuth = async () => {
      throw new SinglebaseAuthError({
        type: "AUTH_ERROR",
        status: 422,
        message: "VERIFIED_PROVIDER_EMAIL_REQUIRED"
      });
    };
    const { el } = await mountWidget({}, client);
    await settle(el);

    expect(textOf(el)).to.include("needs a verified email address");
  });
});

describe("passwords follow the project's password_policy", () => {
  const strict = settingsWith({
    password_policy: {
      NAME: "STRONG",
      LENGTH: [12, 20] as [number, number],
      SYMBOLS: true,
      NUMBERS: true,
      LOWERCASE: true,
      UPPERCASE: true
    }
  });

  async function signUpWith(password: string, settings: object = strict) {
    const client = signedOutClient();
    let called = false;
    client.signUp = async () => {
      called = true;
      return { id: "u1", next_action: "SIGNIN", next_operation: "auth.signin" } as never;
    };
    const { el } = await mountWidget({ screen: "signup", settings }, client);
    await type(el, "name", "Ada");
    await type(el, "email", "ada@example.com");
    await type(el, "pass", password);
    await submit(el);
    return { el, called };
  }

  it("refuses a password the policy rejects, naming the rule", async () => {
    const short = await signUpWith("Ab1!");
    expect(short.called).to.be.false;
    expect(textOf(short.el)).to.include("Use at least 12 characters.");

    const noSymbol = await signUpWith("Abcdefgh1234");
    expect(noSymbol.called).to.be.false;
    expect(textOf(noSymbol.el)).to.include("Include a symbol.");
  });

  it("accepts a password that meets every rule", async () => {
    const ok = await signUpWith("Abcdefgh123!");
    expect(ok.called).to.be.true;
  });

  it("uses the project's minimum, not a fixed one", async () => {
    // The fixture policy is 8–64 with a number: 9 characters is enough.
    const { called } = await signUpWith("abcdefg12", SETTINGS);
    expect(called).to.be.true;
  });

  it("applies to a password reset too", async () => {
    const client = signedOutClient();
    let called = false;
    client.resetPassword = async () => {
      called = true;
      return {} as never;
    };
    const { el } = await mountWidget({ screen: "newpass", settings: strict }, client);
    await type(el, "newpass", "short");
    await type(el, "confirmpass", "short");
    await submit(el);
    expect(called).to.be.false;
    expect(textOf(el)).to.include("Use at least 12 characters.");
  });

  it("doesn't check an existing password on sign-in", async () => {
    const client = signedOutClient();
    let called = false;
    client.signIn = async () => {
      called = true;
      return {} as never;
    };
    const { el } = await mountWidget({ settings: strict }, client);
    await type(el, "email", "ada@example.com");
    await type(el, "pass", "old");
    await submit(el);
    expect(called).to.be.true;
  });
});

describe("the OAuth return is recognised narrowly", () => {
  const originalUrl = globalThis.location.href;
  afterEach(() => history.replaceState({}, "", originalUrl));

  it("leaves the page's own ?error= alone", async () => {
    history.replaceState({}, "", `${location.pathname}?error=session_expired`);
    const { el } = await mountWidget();
    await settle(el);
    expect(textOf(el)).to.not.include("cancelled or denied");
    expect(location.search).to.equal("?error=session_expired");
  });
});

describe("connecting a provider while signed in", () => {
  const originalUrl = globalThis.location.href;
  afterEach(() => {
    history.replaceState({}, "", originalUrl);
    sessionStorage.clear();
  });

  const returnFromProvider = () => {
    history.replaceState({}, "", `${location.pathname}?access_code=abc`);
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");
    sessionStorage.setItem("singlebase-oauth-nonce:link", "github");
  };

  it("says which provider was connected, on the account view", async () => {
    returnFromProvider();
    const client = signedInClient();
    client.completeOAuth = async () => ({}) as never;
    const { el } = await mountWidget({}, client);
    await settle(el);

    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
    expect(textOf(el)).to.include("GitHub is now connected to your account.");
    expect(sessionStorage.getItem("singlebase-oauth-nonce:link")).to.equal(null);
  });

  it("shows a failed link on the account view", async () => {
    returnFromProvider();
    const client = signedInClient();
    client.completeOAuth = async () => {
      throw new SinglebaseAuthError({
        type: "AUTH_ERROR",
        status: 400,
        message: "OAUTH_VERIFICATION_FAILED"
      });
    };
    const { el } = await mountWidget({}, client);
    await settle(el);

    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
    expect(textOf(el)).to.include("couldn't finish signing you in");
  });

  it("asks to sign in first when the email already has an account", async () => {
    history.replaceState({}, "", `${location.pathname}?access_code=abc`);
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");
    const client = signedOutClient();
    client.completeOAuth = async () => {
      throw new SinglebaseAuthError({
        type: "AUTH_ERROR",
        status: 409,
        message: "SIGN_IN_TO_LINK_PROVIDER"
      });
    };
    const { el } = await mountWidget({}, client);
    await settle(el);

    expect(textOf(el)).to.include("Sign in first, then connect the provider");
  });
});

describe("OAuth-only accounts", () => {
  /** Clicks the first provider on the widget and returns the intent it started with. */
  async function startedIntent(settings: object, screen = "signin") {
    const client = signedOutClient();
    let intent: unknown;
    client.createOAuthNonce = async () => "n".repeat(32);
    client.startOAuth = async (input: { intent?: string }) => {
      intent = input.intent;
      throw new Error("stop before navigating");
    };
    const { el } = await mountWidget({ screen, settings }, client);
    const buttons = el.shadowRoot!.querySelector("singlebase-authui-buttons")! as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    await buttons.updateComplete;
    buttons.shadowRoot!.querySelector<HTMLButtonElement>(".oauth-primary")!.click();
    await settle(buttons);
    return intent;
  }

  it("lets a first-time visitor sign up from the sign-in screen", async () => {
    expect(await startedIntent(SETTINGS)).to.equal("signup");
  });

  it("keeps the sign-in intent when the project doesn't allow OAuth sign-up", async () => {
    expect(await startedIntent(settingsWith({}, { allow_signup: false }))).to.equal("signin");
  });

  it("changes the password without asking for a current one", async () => {
    const client = signedInClient();
    let sent: unknown;
    client.changePassword = async (input: never) => {
      sent = input;
      return {} as never;
    };
    const el = await fixture<SinglebaseAccountScreen>(
      html`<singlebase-authui-account></singlebase-authui-account>`
    );
    el.client = client as never;
    el.settings = SETTINGS as never;
    await el.updateComplete;
    const button = (text: string) =>
      [...el.shadowRoot!.querySelectorAll("button")].find((b) => b.textContent!.includes(text))!;
    button("Change password").click();
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector('input[id$="curpass"]')).to.not.exist;
    await type(el, "newpass", "newpassword1");
    await type(el, "confirmpass", "newpassword1");
    button("Update password").click();
    await settle(el);
    expect(sent).to.deep.equal({ password: "newpassword1" });
  });
});

describe("OAuth errors sent back on the redirect", () => {
  const originalUrl = globalThis.location.href;
  afterEach(() => {
    history.replaceState({}, "", originalUrl);
    sessionStorage.clear();
  });

  const landWith = async (search: string, client = signedOutClient()) => {
    history.replaceState({}, "", `${location.pathname}?${search}`);
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");
    const { el } = await mountWidget({}, client);
    await settle(el);
    return el;
  };

  it("explains a known code and cleans the URL", async () => {
    const el = await landWith("oauth_error=SIGN_IN_TO_LINK_PROVIDER&tab=1");
    expect(textOf(el)).to.include("Sign in first, then connect the provider");
    expect(location.search).to.equal("?tab=1");
    expect(sessionStorage.getItem("singlebase-oauth-nonce")).to.equal(null);
  });

  it("says no account exists for an unknown provider identity", async () => {
    const el = await landWith("oauth_error=INVALID_CREDENTIALS");
    expect(textOf(el)).to.include("no account for that provider");
  });

  it("explains a provider already connected elsewhere, on the account view", async () => {
    const el = await landWith("oauth_error=PROVIDER_ALREADY_LINKED", signedInClient());
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
    expect(textOf(el)).to.include("already connected to another account");
  });

  it("never shows text from the URL", async () => {
    const el = await landWith(`oauth_error=${encodeURIComponent("<b>Call 555</b>")}`);
    expect(textOf(el)).to.not.include("555");
    expect(textOf(el)).to.include("Something went wrong");
  });
});

describe("the account view after sign-in", () => {
  it("doesn't carry over a guest screen's message", async () => {
    const client = signedOutClient();
    const { el } = await mountWidget({}, client);
    (el as unknown as { notice: string }).notice = "Account created. Sign in to continue.";
    await el.updateComplete;

    client.setState(authedState());
    await settle(el);

    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
    expect(textOf(el)).to.not.include("Account created");
  });
});

describe("new-password placeholders", () => {
  it("show the project's minimum on the invite screen", async () => {
    const { el } = await mountWidget({
      screen: "invite",
      inviteEmail: "ada@example.com",
      settings: settingsWith({
        password_policy: { ...SETTINGS.auth_settings.password_policy, LENGTH: [12, 64] }
      })
    });
    const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id$="invitepass"]')!;
    expect(input.placeholder).to.equal("At least 12 characters");
  });

  it("show it on sign-up too, but not on sign-in", async () => {
    const { el: signup } = await mountWidget({ screen: "signup" });
    expect(
      signup.shadowRoot!.querySelector<HTMLInputElement>('input[id$="pass"]')!.placeholder
    ).to.equal("At least 8 characters");
    const { el: signin } = await mountWidget();
    expect(
      signin.shadowRoot!.querySelector<HTMLInputElement>('input[id$="pass"]')!.placeholder
    ).to.not.include("At least");
  });
});

describe("consent line", () => {
  it("is centered", async () => {
    const { el } = await mountWidget({ screen: "invite", inviteEmail: "a@b.co", tosUrl: "/terms" });
    const consent = el.shadowRoot!.querySelector<HTMLElement>('[part="consent"]')!;
    expect(getComputedStyle(consent).textAlign).to.equal("center");
  });
});

describe("password requirements hint", () => {
  const hint = (el: SinglebaseAuthScreen) =>
    el.shadowRoot!.querySelector<HTMLDetailsElement>('[part="password-rules"]');

  it("is closed by default and lists the policy's rules", async () => {
    const { el } = await mountWidget({ screen: "signup" });
    const details = hint(el)!;
    expect(details.open).to.be.false;
    expect([...details.querySelectorAll("li")].map((li) => li.textContent!.trim())).to.deep.equal([
      "8–64 characters",
      "A number"
    ]);
  });

  it("only lists: typing and failed submits leave it as it is", async () => {
    const { el } = await mountWidget({ screen: "signup" });
    await type(el, "name", "Ada");
    await type(el, "email", "ada@example.com");
    await type(el, "pass", "abcdefghij");
    await submit(el);
    expect(hint(el)!.open).to.be.false;
    expect(textOf(el)).to.include("Include a number.");
  });

  it("is on the invite and reset screens, not on sign-in", async () => {
    const { el: invite } = await mountWidget({ screen: "invite", inviteEmail: "a@b.co" });
    expect(hint(invite)).to.exist;
    const { el: reset } = await mountWidget({ screen: "newpass" });
    expect(hint(reset)).to.exist;
    const { el: signin } = await mountWidget();
    expect(hint(signin)).to.not.exist;
  });
});

describe("sign-up asks for the name first", () => {
  it("reports a missing name before a weak password", async () => {
    const { el } = await mountWidget({ screen: "signup" });
    await type(el, "email", "ada@example.com");
    await type(el, "pass", "short");
    await submit(el);
    expect(textOf(el)).to.include("Enter your first name.");
    expect(textOf(el)).to.not.include("Use at least");
  });

  it("walks through the stepped flow: name, then email, then password", async () => {
    const client = signedOutClient();
    let sent: Record<string, unknown> | undefined;
    client.signUp = async (input: never) => {
      sent = input;
      return { id: "u1", next_action: "SIGNIN", next_operation: "auth.signin" } as never;
    };
    const { el } = await mountWidget({ screen: "signup", stepped: true }, client);

    await submit(el); // no name yet
    expect(textOf(el)).to.include("Enter your first name.");

    await type(el, "name", "Ada Lovelace");
    await submit(el);
    await type(el, "email", "ada@example.com");
    await submit(el);
    await type(el, "pass", "correct horse battery 9");
    await submit(el);

    expect(sent).to.deep.equal({
      email: "ada@example.com",
      password: "correct horse battery 9",
      first_name: "Ada",
      last_name: "Lovelace"
    });
  });
});
