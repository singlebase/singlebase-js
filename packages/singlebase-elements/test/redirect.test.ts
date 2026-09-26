import { fixture, html, expect } from "@open-wc/testing";
import { resolveRedirectTarget } from "../src/utils/redirect.js";
import "../src/elements/authui-buttons.js";
import type { SinglebaseAuthButtons } from "../src/elements/authui-buttons.js";
import { signedInClient, signedOutClient } from "./fixtures.js";

const HERE = "https://app.example.com/login";

describe("resolveRedirectTarget", () => {
  it("resolves a relative path against the current page", () => {
    expect(resolveRedirectTarget("/dashboard", HERE)).to.equal("https://app.example.com/dashboard");
  });

  it("accepts an absolute same-origin URL", () => {
    expect(resolveRedirectTarget("https://app.example.com/inbox", HERE)).to.equal(
      "https://app.example.com/inbox"
    );
  });

  it("refuses a cross-origin redirect", () => {
    const reasons: string[] = [];
    expect(resolveRedirectTarget("https://evil.example/steal", HERE, (r) => reasons.push(r))).to.be
      .null;
    expect(reasons[0]).to.contain("cross-origin");
  });

  it("refuses a protocol-relative URL, which is cross-origin in disguise", () => {
    expect(resolveRedirectTarget("//evil.example/steal", HERE)).to.be.null;
  });

  it("refuses a javascript: scheme", () => {
    const reasons: string[] = [];
    // eslint-disable-next-line no-script-url
    expect(resolveRedirectTarget("javascript:alert(1)", HERE, (r) => reasons.push(r))).to.be.null;
    expect(reasons[0]).to.contain("scheme");
  });

  it("refuses a data: scheme", () => {
    expect(resolveRedirectTarget("data:text/html,<script>alert(1)</script>", HERE)).to.be.null;
  });

  it("refuses a different port on the same host", () => {
    expect(resolveRedirectTarget("https://app.example.com:8443/x", HERE)).to.be.null;
  });

  it("returns null when the target is the page we are already on", () => {
    expect(resolveRedirectTarget(HERE, HERE)).to.be.null;
    expect(resolveRedirectTarget("/login", HERE)).to.be.null;
  });

  it("returns null when there is nothing to resolve", () => {
    expect(resolveRedirectTarget("", HERE)).to.be.null;
    expect(resolveRedirectTarget(null, HERE)).to.be.null;
    expect(resolveRedirectTarget("/x", null)).to.be.null;
  });

  it("keeps the query and hash of a same-origin target", () => {
    expect(resolveRedirectTarget("/app?tab=2#top", HERE)).to.equal(
      "https://app.example.com/app?tab=2#top"
    );
  });
});

describe("singlebase-authui-buttons", () => {
  it("defaults to the signout button", async () => {
    const el = await fixture<SinglebaseAuthButtons>(
      html`<singlebase-authui-buttons
        .client=${signedInClient() as never}
      ></singlebase-authui-buttons>`
    );
    await el.updateComplete;
    expect(el.type).to.equal("signout");
    expect(el.shadowRoot!.textContent).to.contain("Sign out");
  });

  it("calls logout when the signout button is pressed", async () => {
    const client = signedInClient();
    let signedOut = false;
    client.signOut = async () => {
      signedOut = true;
    };
    const el = await fixture<SinglebaseAuthButtons>(
      html`<singlebase-authui-buttons
        type="signout"
        .client=${client as never}
      ></singlebase-authui-buttons>`
    );
    await el.updateComplete;
    el.shadowRoot!.querySelector("button")!.click();
    await el.updateComplete;
    expect(signedOut).to.be.true;
  });

  it("exposes a part hook on the signout button", async () => {
    const el = await fixture<SinglebaseAuthButtons>(
      html`<singlebase-authui-buttons
        .client=${signedInClient() as never}
      ></singlebase-authui-buttons>`
    );
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('[part="button-signout"]')).to.exist;
  });

  it("renders provider buttons for type=oauth", async () => {
    const el = await fixture<SinglebaseAuthButtons>(html`
      <singlebase-authui-buttons
        type="oauth"
        .client=${signedOutClient() as never}
        .settings=${
          {
            enabled: true,
            oauth_settings: { enabled: true, allow_signin: true, allow_signup: true },
            oauth_providers: {
              google: { enabled: true, type: "client", name: "google", provider_name: "Google" },
              github: { enabled: true, type: "client", name: "github", provider_name: "GitHub" }
            }
          } as never
        }
      ></singlebase-authui-buttons>
    `);
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).to.contain("Google");
    expect(el.shadowRoot!.querySelectorAll('[part="oauth-button"]').length).to.equal(2);
  });

  it("renders nothing for type=oauth when no providers are enabled", async () => {
    const el = await fixture<SinglebaseAuthButtons>(html`
      <singlebase-authui-buttons
        type="oauth"
        .client=${signedOutClient() as never}
        .settings=${
          {
            enabled: true,
            oauth_settings: { enabled: false, allow_signin: false, allow_signup: false },
            oauth_providers: {}
          } as never
        }
      ></singlebase-authui-buttons>
    `);
    await el.updateComplete;
    expect(el.shadowRoot!.textContent!.trim()).to.equal("");
  });

  it("refuses to link a provider while signed out", async () => {
    const el = await fixture<SinglebaseAuthButtons>(html`
      <singlebase-authui-buttons
        type="link"
        provider="github"
        provider-name="GitHub"
        .client=${signedOutClient() as never}
      ></singlebase-authui-buttons>
    `);
    await el.updateComplete;
    el.shadowRoot!.querySelector("button")!.click();
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).to.contain("Sign in first");
  });
});
