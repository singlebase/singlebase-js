import { fixture, html, expect } from "@open-wc/testing";
import type { AuthUIConfig } from "@singlebase/core";
import "../src/elements/auth-screen.js";
import "../src/elements/display.js";
import type { SinglebaseAuthScreen } from "../src/elements/auth-screen.js";
import { SETTINGS, signedInClient, signedOutClient } from "./fixtures.js";

/** A client carrying page-wide UI config, as SinglebaseClient({ authui }) would. */
function clientWithConfig(authui: AuthUIConfig, signedIn = false) {
  const client = signedIn ? signedInClient() : signedOutClient();
  (client as { authui: AuthUIConfig }).authui = authui;
  return client;
}

async function mount(authui: AuthUIConfig, markup = html`<singlebase-authui></singlebase-authui>`) {
  const client = clientWithConfig(authui);
  const el = await fixture<SinglebaseAuthScreen>(markup);
  el.client = client as never;
  el.settings = SETTINGS as never;
  await el.updateComplete;
  return el;
}

describe("SinglebaseClient({ authui })", () => {
  it("applies appearance config to a bare element", async () => {
    const el = await mount({ theme: "dark", density: "compact", fieldStyle: "underline" });
    expect(el.theme).to.equal("dark");
    expect(el.density).to.equal("compact");
    expect(el.fieldStyle).to.equal("underline");
  });

  it("applies layout and branding", async () => {
    const el = await mount({ layout: "split", logoText: "ACME", brandLine: "Build things." });
    expect(el.layout).to.equal("split");
    expect(el.logoText).to.equal("ACME");
    expect(el.shadowRoot!.querySelector(".brand-panel")).to.exist;
  });

  it("applies sign-in method flags", async () => {
    const el = await mount({ allowOauth: false, allowEmailOtp: false });
    expect(el.allowOauth).to.be.false;
    expect(el.allowEmailOtp).to.be.false;
    expect(el.shadowRoot!.textContent).to.not.include("Single sign-on");
  });

  it("applies behaviour config", async () => {
    const el = await mount({ redirectUrl: "/dashboard", tosUrl: "/terms", noAccountView: true });
    expect(el.redirectUrl).to.equal("/dashboard");
    expect(el.tosUrl).to.equal("/terms");
    expect(el.noAccountView).to.be.true;
  });

  it("applies design tokens as custom properties", async () => {
    const el = await mount({ tokens: { "--sb-accent": "#2f5bea", "--sb-radius": "10px" } });
    expect(el.style.getPropertyValue("--sb-accent")).to.equal("#2f5bea");
    expect(el.style.getPropertyValue("--sb-radius")).to.equal("10px");
  });

  it("applies message overrides", async () => {
    const el = await mount({ messages: { signInTitle: "Bienvenue" } });
    expect(el.shadowRoot!.textContent).to.include("Bienvenue");
  });
});

describe("authui config precedence", () => {
  it("lets an attribute in markup win over the config", async () => {
    const el = await mount(
      { theme: "dark", layout: "split" },
      html`<singlebase-authui theme="light"></singlebase-authui>`
    );
    expect(el.theme).to.equal("light"); // the attribute wins
    expect(el.layout).to.equal("split"); // the rest still comes from config
  });

  it("checks precedence per key, not wholesale", async () => {
    const el = await mount(
      { logoText: "CONFIG", brandLine: "from config", layout: "split" },
      html`<singlebase-authui logo-text="MARKUP"></singlebase-authui>`
    );
    expect(el.logoText).to.equal("MARKUP");
    expect(el.brandLine).to.equal("from config");
  });

  it("lets a flag attribute override a config flag", async () => {
    const el = await mount(
      { allowOauth: false },
      html`<singlebase-authui allow-oauth="true"></singlebase-authui>`
    );
    expect(el.allowOauth).to.be.true;
  });

  it("lets an inline token override a config token", async () => {
    const el = await mount(
      { tokens: { "--sb-accent": "#2f5bea" } },
      html`<singlebase-authui style="--sb-accent: #ff0000"></singlebase-authui>`
    );
    expect(el.style.getPropertyValue("--sb-accent").trim()).to.equal("#ff0000");
  });

  it("lets element messages override config messages key by key", async () => {
    const client = clientWithConfig({
      messages: { signInTitle: "Config", signInCta: "Config CTA" }
    });
    const el = await fixture<SinglebaseAuthScreen>(html`<singlebase-authui></singlebase-authui>`);
    el.client = client as never;
    el.settings = SETTINGS as never;
    el.messages = { signInTitle: "Element" };
    await el.updateComplete;

    const text = el.shadowRoot!.textContent!;
    expect(text).to.include("Element");
    expect(text).to.include("Config CTA");
  });

  it("does not fight the host after the first application", async () => {
    const el = await mount({ theme: "dark" });
    expect(el.theme).to.equal("dark");

    el.theme = "light";
    await el.updateComplete;
    await el.updateComplete;

    expect(el.theme).to.equal("light");
  });
});

describe("authui config across elements", () => {
  it("reaches every singlebase-authui-* element, not just the widget", async () => {
    const client = clientWithConfig({ theme: "dark" }, true);
    const el = await fixture(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`
    );
    (el as unknown as { client: unknown }).client = client;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    expect(el.getAttribute("theme")).to.equal("dark");
  });

  it("silently skips keys an element does not have", async () => {
    const client = clientWithConfig({ theme: "dark", layout: "split", stepped: true }, true);
    const el = await fixture(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`
    );
    (el as unknown as { client: unknown }).client = client;
    await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;

    // layout/stepped only exist on the widget; applying them here must not throw.
    expect(el.getAttribute("theme")).to.equal("dark");
    expect(el.getAttribute("layout")).to.be.null;
  });

  it("is a no-op when the client carries no config", async () => {
    const el = await fixture<SinglebaseAuthScreen>(html`<singlebase-authui></singlebase-authui>`);
    el.client = signedOutClient() as never;
    await el.updateComplete;
    expect(el.uiConfig).to.be.null;
    expect(el.theme).to.be.undefined;
  });
});
