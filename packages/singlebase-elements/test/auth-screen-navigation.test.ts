import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import { resolveScreen } from "@singlebase/singlebase-sdk";
import "../src/elements/auth-screen.js";
import type { SinglebaseAuthScreen } from "../src/elements/auth-screen.js";
import { createMockClient } from "./mock-client.js";

const SETTINGS = {
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

function text(el: SinglebaseAuthScreen) {
  return el.shadowRoot!.textContent ?? "";
}

async function mount(attrs = {}) {
  const client = createMockClient();
  const el = await fixture<SinglebaseAuthScreen>(
    html`<singlebase-authui .client=${client} .settings=${SETTINGS as any}></singlebase-authui>`
  );
  Object.assign(el, attrs);
  await el.updateComplete;
  return { el, client };
}

describe("singlebase-authui", () => {
  it("renders the signin screen with the title and method accordion", async () => {
    const { el } = await mount();
    expect(text(el)).to.include("Sign in");
    expect(text(el)).to.include("Use your email or a connected provider.");
    // both accordion heads are present
    expect(text(el)).to.include("Email");
    expect(text(el)).to.include("Single sign-on");
    expect(el.shadowRoot!.querySelectorAll(".acc-item").length).to.equal(2);
  });

  it("opens the email method by default and toggles to single sign-on", async () => {
    const { el } = await mount();
    const [emailItem, oauthItem] = Array.from(el.shadowRoot!.querySelectorAll(".acc-item"));
    expect(emailItem.classList.contains("open")).to.be.true;
    expect(oauthItem.classList.contains("open")).to.be.false;

    (oauthItem.querySelector(".acc-head") as HTMLButtonElement).click();
    await el.updateComplete;

    expect(el.shadowRoot!.querySelectorAll(".acc-item")[0].classList.contains("open")).to.be.false;
    expect(el.shadowRoot!.querySelectorAll(".acc-item")[1].classList.contains("open")).to.be.true;
  });

  it("switches to the signup screen from the footer link", async () => {
    const { el } = await mount();
    const link = Array.from(el.shadowRoot!.querySelectorAll("button.link")).find((b) =>
      b.textContent?.includes("Create an account")
    ) as HTMLButtonElement;
    link.click();
    await el.updateComplete;

    expect(text(el)).to.include("Create your account");
    expect(text(el)).to.include("Free to start. No card required.");
    expect(text(el)).to.include("Email and password");
  });

  it("renders the blocked state when auth is disabled", async () => {
    const client = createMockClient();
    const el = await fixture<SinglebaseAuthScreen>(
      html`<singlebase-authui
        auth-enabled="false"
        .client=${client}
        .settings=${SETTINGS as any}
      ></singlebase-authui>`
    );
    await el.updateComplete;
    expect(text(el)).to.include("Sign-in is turned off");
    expect(text(el)).to.include("Contact the site owner if you think this is a mistake.");
  });

  it("falls back to the bare provider list when every email method is off", async () => {
    const client = createMockClient();
    const el = await fixture<SinglebaseAuthScreen>(
      html`<singlebase-authui
        allow-email-signin="false"
        allow-email-signup="false"
        allow-email-otp="false"
        .client=${client}
        .settings=${SETTINGS as any}
      ></singlebase-authui>`
    );
    await el.updateComplete;
    expect(text(el)).to.include("Continue with a connected provider.");
    // single method → accordion renders bare, with no clickable heads
    expect(el.shadowRoot!.querySelectorAll(".acc-head").length).to.equal(0);
    expect(el.shadowRoot!.querySelector(".acc-item.bare")).to.exist;
  });

  it("carries no branding of its own until the host supplies some", async () => {
    // The design mock's fictional brand must never ship as a default.
    const { el } = await mount();
    expect(el.logoText).to.equal("");
    expect(text(el)).to.not.include("KEYRING");
    expect(el.shadowRoot!.querySelector(".logo-dot")).to.not.exist;
  });

  it("renders the logo-dot once a host sets logo-text", async () => {
    const { el } = await mount();
    el.logoText = "ACME";
    await el.updateComplete;
    const dot = el.shadowRoot!.querySelector(".logo-dot");
    expect(dot).to.exist;
    expect(dot!.textContent!.trim()).to.equal("ACME");
  });

  it("shows the brand panel in split layout, with the host's copy", async () => {
    const { el } = await mount();
    el.layout = "split";
    el.logoText = "ACME";
    el.brandLine = "One account for everything you build.";
    el.brandFoot = "Secured by Singlebase";
    await el.updateComplete;

    const brand = el.shadowRoot!.querySelector(".brand-panel");
    expect(brand).to.exist;
    expect(brand!.textContent).to.include("One account for everything you build.");
    expect(brand!.textContent).to.include("Secured by Singlebase");
    // the inline logo is replaced by the brand mark
    expect(el.shadowRoot!.querySelector(".logo-dot")).to.not.exist;
  });

  it("leaves the split panel's slots out entirely when unset", async () => {
    const { el } = await mount();
    el.layout = "split";
    await el.updateComplete;
    const brand = el.shadowRoot!.querySelector(".brand-panel");
    expect(brand).to.exist;
    expect(brand!.querySelector(".brand-mark")).to.not.exist;
    expect(brand!.querySelector(".brand-copy")).to.not.exist;
  });
});

describe("resolveScreen — navigation table is the single source of routing", () => {
  it("routes a signup result using next_action/next_operation, not the method name", () => {
    expect(resolveScreen({ next_action: "SIGNIN", next_operation: "auth.signin" })).to.equal(
      "signin"
    );
    expect(
      resolveScreen({ next_action: "SIGNIN_WITH_CODE", next_operation: "auth.signin" })
    ).to.equal("signin_with_code");
  });

  it("routes null/null (a real AuthSession result) to 'authenticated' regardless of the operation", () => {
    expect(resolveScreen({ next_action: null, next_operation: null })).to.equal("authenticated");
  });
});
