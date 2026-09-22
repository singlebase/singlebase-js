import { expect } from "@open-wc/testing";
import "../src/elements/auth-screen.js";
import { isGuestScreen, isProtectedScreen, isScreen } from "../src/elements/auth-screen.js";
import { mountWidget, signedInClient, signedOutClient, textOf } from "./fixtures.js";

describe("screen routing", () => {
  it("classifies screens", () => {
    expect(isGuestScreen("signin")).to.be.true;
    expect(isGuestScreen("my-account")).to.be.false;
    expect(isProtectedScreen("my-account")).to.be.true;
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
  it("refuses my-account for a signed-out visitor and shows signin instead", async () => {
    const { el } = await mountWidget({ screen: "my-account" });
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
    expect(textOf(el)).to.include("Sign in");
  });

  it("cannot be bypassed with goto()", async () => {
    const { el } = await mountWidget();
    el.goto("my-account");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
  });

  it("cannot be bypassed by setting the attribute directly", async () => {
    const { el } = await mountWidget();
    el.setAttribute("screen", "my-account");
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.not.exist;
  });

  it("renders my-account once a session exists", async () => {
    const { el } = await mountWidget({ screen: "my-account" }, signedInClient());
    expect(el.shadowRoot!.querySelector("singlebase-authui-account")).to.exist;
  });

  it("drops back to signin when the session goes away underneath it", async () => {
    const client = signedInClient();
    const { el } = await mountWidget({ screen: "my-account" }, client);
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
    expect(el.screen).to.equal("my-account");
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
