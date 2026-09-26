import { expect, fixture, html } from "@open-wc/testing";
import "../src/elements/authui.js";
import "../src/elements/uploader.js";
import "../src/elements/chat.js";
import { mountWidget, signedInClient, textOf } from "./fixtures.js";

const badge = (el: { shadowRoot: ShadowRoot | null }) =>
  el.shadowRoot!.querySelector<HTMLAnchorElement>('[part="branding"] a');

describe("branding credit", () => {
  it("is shown by default", async () => {
    const { el } = await mountWidget();
    expect(badge(el)).to.exist;
    expect(textOf(el)).to.include("Auth by Singlebase");
  });

  it("links to singlebase.cloud, safely", async () => {
    const { el } = await mountWidget();
    const a = badge(el)!;
    expect(a.getAttribute("href")).to.equal("https://singlebase.cloud");
    expect(a.getAttribute("rel")).to.equal("noopener noreferrer");
    expect(a.getAttribute("target")).to.equal("_blank");
  });

  it("is a plain link — it must never make a request of its own", async () => {
    // A third-party beacon fired from a sign-in form fails security review.
    const { el } = await mountWidget();
    const root = el.shadowRoot!;
    expect(root.querySelector("img[src]")).to.not.exist;
    expect(root.querySelector("iframe")).to.not.exist;
    expect(root.querySelector("script")).to.not.exist;
  });

  it("turns off with branding=false, like the other default-on flags", async () => {
    const { el } = await mountWidget();
    el.setAttribute("branding", "false");
    await el.updateComplete;
    expect(badge(el)).to.not.exist;
  });

  it("comes back when the attribute is removed", async () => {
    const { el } = await mountWidget();
    el.setAttribute("branding", "false");
    await el.updateComplete;
    expect(badge(el)).to.not.exist;

    el.removeAttribute("branding");
    await el.updateComplete;
    expect(badge(el)).to.exist;
  });

  it("appears exactly once, never per screen section", async () => {
    const { el } = await mountWidget();
    expect(el.shadowRoot!.querySelectorAll('[part="branding"]')).to.have.length(1);
  });

  it("appears on the account screen too", async () => {
    const { el } = await mountWidget({ screen: "account" }, signedInClient());
    expect(badge(el)).to.exist;
  });

  it("appears on the already-signed-in interstitial", async () => {
    const { el } = await mountWidget({ screen: "signin" }, signedInClient());
    expect(badge(el)).to.exist;
  });

  it("appears in the split layout as well as the card", async () => {
    const { el } = await mountWidget({ layout: "split" });
    expect(badge(el)).to.exist;
  });

  it("does not collide with the host's own brand-foot", async () => {
    const { el } = await mountWidget({ layout: "split", brandFoot: "Secured by Acme" });
    const brandPanel = el.shadowRoot!.querySelector(".brand-panel")!;
    // The host's line stays in its panel; the credit sits under the form.
    expect(brandPanel.textContent).to.include("Secured by Acme");
    expect(brandPanel.querySelector('[part="branding"]')).to.not.exist;
    expect(badge(el)).to.exist;
  });

  it("is the last thing in the panel, so it never precedes the form", async () => {
    const { el } = await mountWidget();
    const panel = el.shadowRoot!.querySelector(".panel")!;
    expect(panel.lastElementChild!.getAttribute("part")).to.equal("branding");
  });

  it("can be relabelled through messages, for translation", async () => {
    const { el } = await mountWidget();
    el.messages = { brandingLabel: "Authentification par Singlebase" };
    await el.updateComplete;
    expect(badge(el)!.textContent!.trim()).to.equal("Authentification par Singlebase");
  });
});

describe("branding across elements", () => {
  const mountAll = async (attrs = "") => {
    const { el: auth } = await mountWidget();
    const wrap = await fixture<HTMLDivElement>(
      html`<div>
        <singlebase-uploader></singlebase-uploader>
        <singlebase-chat></singlebase-chat>
      </div>`
    );
    const els = [auth, ...Array.from(wrap.children)] as any[];
    for (const el of els) {
      if (attrs) Object.assign(el, JSON.parse(attrs));
      await el.updateComplete;
    }
    return els;
  };

  it("looks the same in the auth widget, the uploader and the chat", async () => {
    const looks = (await mountAll()).map((el) => {
      const style = getComputedStyle(el.shadowRoot!.querySelector('[part="branding"]')!);
      return [style.fontFamily, style.fontSize, style.letterSpacing, style.textTransform].join("|");
    });
    expect(new Set(looks).size).to.equal(1);
  });

  it("takes a custom text and link on every element", async () => {
    const els = await mountAll(
      JSON.stringify({ brandingText: "Powered by Acme", brandingUrl: "https://acme.test/" })
    );
    for (const el of els) {
      const a = badge(el)!;
      expect(a.textContent!.trim()).to.equal("Powered by Acme");
      expect(a.getAttribute("href")).to.equal("https://acme.test/");
    }
  });

  it("refuses a non-http link", async () => {
    const els = await mountAll(JSON.stringify({ brandingUrl: "javascript:alert(1)" }));
    for (const el of els)
      expect(badge(el)!.getAttribute("href")).to.equal("https://singlebase.cloud");
  });
});
