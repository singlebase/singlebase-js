import { expect } from "@open-wc/testing";
import "../src/elements/auth-screen.js";
import { isGuestScreen, isProtectedScreen, isScreen } from "../src/elements/auth-screen.js";
import { mountWidget, signedInClient, signedOutClient, textOf } from "./fixtures.js";

describe("screen routing", () => {
  it("classifies screens", () => {
    expect(isGuestScreen("signin")).to.be.true;
    expect(isGuestScreen("account")).to.be.false;
    expect(isProtectedScreen("account")).to.be.true;
    expect(isScreen("oauth-callback")).to.be.true;
    expect(isScreen("nonsense")).to.be.false;
  });

  it("opens on signin for a signed-out visitor", async () => {
    const { el } = await mountWidget();
    expect(textOf(el)).to.include("Sign in");
  });

  it("honours an explicit guest screen", async () => {
    const { el } = await mountWidget({ screen: "signup" });
    expect(el.shadowRoot!.querySelector(".title")!.textContent).to.not.include(
      "Sign in with a code"
    );
    expect(textOf(el)).to.include("Create");
  });

  it("falls back to signin for a screen value it does not know", async () => {
    const { el } = await mountWidget({ screen: "nonsense" as never });
    expect(textOf(el)).to.include("Sign in");
  });

  it("shows the account view when signed in and no screen was asked for", async () => {
    const { el } = await mountWidget({}, signedInClient());
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
  });
});

describe("protected screens are guarded", () => {
  it("refuses account for a signed-out visitor and shows signin instead", async () => {
    const { el } = await mountWidget({ screen: "account" });
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
    expect(textOf(el)).to.include("Sign in");
  });

  it("cannot be bypassed with goto()", async () => {
    const { el } = await mountWidget();
    el.goto("account");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
  });

  it("cannot be bypassed by setting the attribute directly", async () => {
    const { el } = await mountWidget();
    el.setAttribute("screen", "account");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
  });

  it("renders account once a session exists", async () => {
    const { el } = await mountWidget({ screen: "account" }, signedInClient());
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
  });

  it("drops back to signin when the session goes away underneath it", async () => {
    const client = signedInClient();
    const { el } = await mountWidget({ screen: "account" }, client);
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;

    client.setState({ status: "unauthenticated", session: null, user: null });
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
    expect(textOf(el)).to.include("Sign in");
  });
});

describe("already-signed-in interstitial", () => {
  it("offers continue or sign out instead of a sign-in form", async () => {
    const { el } = await mountWidget({ screen: "signin" }, signedInClient());
    const body = textOf(el);
    expect(body).to.include("already signed in");
    expect(body).to.include("Continue");
    expect(body).to.include("Sign out");
    expect(el.shadowRoot!.querySelector('input[type="password"]')).to.not.exist;
  });

  it("names the signed-in account", async () => {
    const { el } = await mountWidget({ screen: "signin" }, signedInClient());
    expect(textOf(el)).to.include("ada@example.com");
  });

  it("also covers signup", async () => {
    const { el } = await mountWidget({ screen: "signup" }, signedInClient());
    expect(textOf(el)).to.include("already signed in");
  });

  it("continue moves to the account view when there is nowhere to redirect", async () => {
    const { el } = await mountWidget({ screen: "signin" }, signedInClient());
    const buttons = [...el.shadowRoot!.querySelectorAll("button")];
    const cont = buttons.find((b) => b.textContent!.includes("Continue"))!;

    let fired = false;
    el.addEventListener("singlebase-continue", () => (fired = true));
    cont.click();
    await el.updateComplete;

    expect(fired).to.be.true;
    expect(el.screen).to.equal("account");
  });

  it("sign out returns to the signin screen", async () => {
    const client = signedInClient();
    client.signOut = async () => {
      client.setState({ status: "unauthenticated", session: null, user: null });
    };
    const { el } = await mountWidget({ screen: "signin" }, client);

    const buttons = [...el.shadowRoot!.querySelectorAll("button")];
    buttons.find((b) => b.textContent!.trim() === "Sign out")!.click();
    await el.updateComplete;
    await el.updateComplete;

    expect(el.screen).to.equal("signin");
  });

  it("renders nothing under no-account-view, leaving routing to the host", async () => {
    const { el } = await mountWidget({ screen: "signin", noAccountView: true }, signedInClient());
    expect(el.shadowRoot!.textContent!.trim()).to.equal("");
  });
});

describe("consent line", () => {
  it("is absent until a host supplies a link", async () => {
    const { el } = await mountWidget();
    expect(el.shadowRoot!.querySelector('[part="consent"]')).to.not.exist;
  });

  it("renders Terms and Privacy when both are given", async () => {
    const { el } = await mountWidget({
      tosUrl: "https://example.com/tos",
      privacyUrl: "https://example.com/privacy"
    });
    const consent = el.shadowRoot!.querySelector('[part="consent"]')!;
    const links = [...consent.querySelectorAll("a")];
    expect(links).to.have.length(2);
    expect(links[0].getAttribute("href")).to.equal("https://example.com/tos");
    expect(links[1].getAttribute("href")).to.equal("https://example.com/privacy");
  });

  it("opens them safely in a new tab", async () => {
    const { el } = await mountWidget({ tosUrl: "https://example.com/tos" });
    const link = el.shadowRoot!.querySelector('[part="consent"] a')!;
    expect(link.getAttribute("rel")).to.equal("noopener noreferrer");
    expect(link.getAttribute("target")).to.equal("_blank");
  });

  it("renders just one when only one is given", async () => {
    const { el } = await mountWidget({ privacyUrl: "https://example.com/privacy" });
    expect(el.shadowRoot!.querySelectorAll('[part="consent"] a')).to.have.length(1);
  });
});

describe("screen-change event", () => {
  it("reports the screen a host navigates to", async () => {
    const { el } = await mountWidget();
    const seen: string[] = [];
    el.addEventListener("singlebase-screen-change", (e) =>
      seen.push((e as CustomEvent).detail.screen)
    );

    el.goto("signup");
    await el.updateComplete;

    expect(seen).to.deep.equal(["signup"]);
  });

  it("does not fire when the screen is unchanged", async () => {
    const { el } = await mountWidget({ screen: "signup" });
    let count = 0;
    el.addEventListener("singlebase-screen-change", () => (count += 1));
    el.goto("signup");
    await el.updateComplete;
    expect(count).to.equal(0);
  });
});

describe("signed-out default", () => {
  it("never renders the account element without a session", async () => {
    const { el } = await mountWidget({}, signedOutClient());
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
  });
});

describe("logo", () => {
  const LOGO = "https://example.com/logo.svg";

  it("renders no logo at all until the host supplies one", async () => {
    const { el } = await mountWidget();
    expect(el.shadowRoot!.querySelector("[part='logo']")).to.not.exist;
  });

  it("renders logo-text as a text mark", async () => {
    const { el } = await mountWidget({ logoText: "ACME" });
    const logo = el.shadowRoot!.querySelector("[part='logo']")!;
    expect(logo.tagName).to.equal("DIV");
    expect(logo.textContent!.trim()).to.equal("ACME");
  });

  it("renders logo-url as an image instead", async () => {
    const { el } = await mountWidget({ logoUrl: LOGO, logoText: "ACME" });
    const logo = el.shadowRoot!.querySelector("[part='logo']")!;
    expect(logo.tagName).to.equal("IMG");
    expect(logo.getAttribute("src")).to.equal(LOGO);
  });

  it("uses logo-text as the image's alt text", async () => {
    const { el } = await mountWidget({ logoUrl: LOGO, logoText: "ACME" });
    expect(el.shadowRoot!.querySelector("img[part='logo']")!.getAttribute("alt")).to.equal("ACME");
  });

  it("uses the image in the split layout's brand panel too", async () => {
    const { el } = await mountWidget({ layout: "split", logoUrl: LOGO });
    const brand = el.shadowRoot!.querySelector(".brand-panel")!;
    expect(brand.querySelector("img[part='logo']")).to.exist;
    expect(brand.querySelector(".brand-mark")).to.not.exist;
  });

  it("does not stretch inside the flex column that holds it", async () => {
    const { el } = await mountWidget({ logoUrl: LOGO });
    const img = el.shadowRoot!.querySelector("img[part='logo']")!;
    expect(getComputedStyle(img).alignSelf).to.equal("flex-start");
  });

  it("forwards the logo to the account view", async () => {
    const { el } = await mountWidget({ logoUrl: LOGO, logoText: "ACME" }, signedInClient());
    const account = el.shadowRoot!.querySelector("singlebase-authui-account")!;
    expect(account.getAttribute("logo-url")).to.equal(LOGO);
    expect(account.getAttribute("logo-text")).to.equal("ACME");
  });
});

describe("allow-* flags", () => {
  it("defaults to on when the attribute is absent", async () => {
    const { el } = await mountWidget();
    expect(el.allowOauth).to.be.true;
    expect(el.allowEmailOtp).to.be.true;
  });

  it("turns off with an explicit false, since bare presence would read as true", async () => {
    const { el } = await mountWidget();
    el.setAttribute("allow-oauth", "false");
    await el.updateComplete;
    expect(el.allowOauth).to.be.false;
  });

  it("comes back when the attribute is removed again", async () => {
    // Regression: fromAttribute(null) used to return false, so removing the
    // attribute left the method switched off for good.
    const { el } = await mountWidget();
    el.setAttribute("allow-oauth", "false");
    await el.updateComplete;
    expect(el.allowOauth).to.be.false;

    el.removeAttribute("allow-oauth");
    await el.updateComplete;
    expect(el.allowOauth).to.be.true;
  });

  it("restores the single sign-on section in the rendered output", async () => {
    const { el } = await mountWidget();
    expect(textOf(el)).to.include("Single sign-on");

    el.setAttribute("allow-oauth", "false");
    await el.updateComplete;
    expect(textOf(el)).to.not.include("Single sign-on");

    el.removeAttribute("allow-oauth");
    await el.updateComplete;
    expect(textOf(el)).to.include("Single sign-on");
  });

  it("round-trips every flag", async () => {
    const { el } = await mountWidget();
    for (const attr of [
      "auth-enabled",
      "allow-email-signin",
      "allow-email-signup",
      "allow-email-otp",
      "allow-oauth",
      "allow-account-creation"
    ]) {
      const prop = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof typeof el;
      el.setAttribute(attr, "false");
      await el.updateComplete;
      expect(el[prop], `${attr} off`).to.be.false;

      el.removeAttribute(attr);
      await el.updateComplete;
      expect(el[prop], `${attr} restored`).to.be.true;
    }
  });
});

describe("verify — resend code", () => {
  it("cannot send two codes from a double click", async () => {
    const { el, client } = await mountWidget({ screen: "verify" });
    (el as any).email = "ada@example.com";
    let sends = 0;
    let release!: () => void;
    (client as any).requestCode = () => {
      sends += 1;
      return new Promise<void>((resolve) => (release = () => resolve()));
    };
    await el.updateComplete;

    const resend = [...el.shadowRoot!.querySelectorAll("button")].find(
      (b) => b.textContent!.trim() === "Resend code"
    )!;
    resend.click();
    resend.click();
    await el.updateComplete;

    expect(sends).to.equal(1);
    expect(resend.disabled).to.equal(true);
    release();
  });
});
