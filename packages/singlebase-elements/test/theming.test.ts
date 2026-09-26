import { fixture, html, expect } from "@open-wc/testing";
import "../src/elements/authui.js";
import "../src/elements/authui-buttons.js";
import type { SinglebaseAuthScreen } from "../src/elements/authui.js";
import { mountWidget, signedInClient } from "./fixtures.js";

describe("theming attributes", () => {
  it("reflects field-style so the attribute selector in shared CSS can match", async () => {
    const el = await fixture<SinglebaseAuthScreen>(
      html`<singlebase-authui field-style="underline"></singlebase-authui>`
    );
    expect(el.fieldStyle).to.equal("underline");
    expect(el.getAttribute("field-style")).to.equal("underline");
  });

  it("sets the attribute when the property is assigned in JS", async () => {
    const el = await fixture<SinglebaseAuthScreen>(html`<singlebase-authui></singlebase-authui>`);
    el.fieldStyle = "underline";
    await el.updateComplete;
    expect(el.getAttribute("field-style")).to.equal("underline");
  });

  it("underline strips the box off ordinary inputs", async () => {
    const { el } = await mountWidget({ fieldStyle: "underline" });
    const input = el.shadowRoot!.querySelector('input[type="email"]');
    if (!input) throw new Error("expected an email input on the signin screen");
    expect(getComputedStyle(input).borderTopStyle).to.equal("none");
  });

  it("forwards theme, density and field-style to composed children", async () => {
    const { el } = await mountWidget(
      { theme: "dark", density: "compact", fieldStyle: "underline" },
      signedInClient()
    );
    const child = el.shadowRoot!.querySelector("singlebase-authui-account");
    if (!child) throw new Error("expected the composed account element");
    expect(child.getAttribute("theme")).to.equal("dark");
    expect(child.getAttribute("density")).to.equal("compact");
    expect(child.getAttribute("field-style")).to.equal("underline");
  });

  it("leaves the attribute off entirely when unset, so defaults apply", async () => {
    const el = await fixture<SinglebaseAuthScreen>(html`<singlebase-authui></singlebase-authui>`);
    expect(el.hasAttribute("field-style")).to.be.false;
    expect(el.hasAttribute("theme")).to.be.false;
  });

  it("applies the dark palette when theme is set", async () => {
    const el = await fixture<SinglebaseAuthScreen>(
      html`<singlebase-authui theme="dark"></singlebase-authui>`
    );
    const surface = getComputedStyle(el).getPropertyValue("--sb-surface").trim();
    expect(surface).to.equal("#17181b");
  });
});
