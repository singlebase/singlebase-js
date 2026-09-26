import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import "../src/elements/authui-account.js";
import type { SinglebaseAccountScreen } from "../src/elements/authui-account.js";
import { SETTINGS, signedInClient } from "./fixtures.js";

async function mountAccount(overrides: Record<string, unknown> = {}) {
  const client = signedInClient();
  Object.assign(client, overrides);
  const el = await fixture<SinglebaseAccountScreen>(
    html`<singlebase-authui-account></singlebase-authui-account>`
  );
  el.client = client as never;
  el.settings = SETTINGS as never;
  await el.updateComplete;
  return { el, client };
}

const byText = (el: SinglebaseAccountScreen, text: string) =>
  [...el.shadowRoot!.querySelectorAll("button")].find((b) => b.textContent!.includes(text));

/** Lets an async run() settle and the resulting render land. */
const settle = async (el: SinglebaseAccountScreen) => {
  await aTimeout(0);
  await el.updateComplete;
};

const type = async (el: SinglebaseAccountScreen, id: string, value: string) => {
  const input = el.shadowRoot!.querySelector<HTMLInputElement>(`input[id$="${id}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await el.updateComplete;
};

describe("account — changing email", () => {
  it("never points at a component that no longer exists", async () => {
    const { el } = await mountAccount();
    // Regression: the profile form used to tell people to use <sb-change-email-form>.
    expect(el.shadowRoot!.innerHTML).to.not.contain("sb-change-email-form");
    expect(el.shadowRoot!.innerHTML).to.not.contain("&lt;sb-");
  });

  it("offers an email section of its own", async () => {
    const { el } = await mountAccount();
    expect(byText(el, "Change email")).to.exist;
    expect(el.shadowRoot!.textContent).to.include("ada@example.com");
  });

  it("asks for the new address first", async () => {
    const { el } = await mountAccount();
    byText(el, "Change email")!.click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('input[id$="newemail"]')).to.exist;
  });

  it("rejects an address that is not an address", async () => {
    const { el, client } = await mountAccount();
    let called = false;
    client.requestCode = async () => {
      called = true;
      return {} as never;
    };
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "not-an-email");
    byText(el, "Send verification code")!.click();
    await settle(el);

    expect(called).to.be.false;
    expect(el.shadowRoot!.querySelector(".err")).to.exist;
  });

  it("rejects the address already on the account", async () => {
    const { el, client } = await mountAccount();
    let called = false;
    client.requestCode = async () => {
      called = true;
      return {} as never;
    };
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "ADA@example.com");
    byText(el, "Send verification code")!.click();
    await settle(el);

    expect(called).to.be.false;
    expect(el.shadowRoot!.textContent).to.include("already your email");
  });

  it("sends the code to the address on file, not the new one", async () => {
    // Proving control of the *existing* account is the point of the step.
    const { el, client } = await mountAccount();
    let payload: unknown;
    client.requestCode = async (input: unknown) => {
      payload = input;
      return {} as never;
    };
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "grace@example.com");
    byText(el, "Send verification code")!.click();
    await settle(el);

    expect(payload).to.deep.contain({ email: "ada@example.com", purpose: "email_change" });
  });

  it("moves to the code step and keeps the message neutral", async () => {
    const { el, client } = await mountAccount();
    client.requestCode = async () => ({}) as never;
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "grace@example.com");
    byText(el, "Send verification code")!.click();
    await settle(el);

    expect(el.shadowRoot!.querySelector('input[id$="emailcode"]')).to.exist;
    expect(el.shadowRoot!.textContent).to.include("If an eligible account exists");
  });

  it("refuses to confirm with an incomplete code", async () => {
    const { el, client } = await mountAccount();
    client.requestCode = async () => ({}) as never;
    let called = false;
    client.changeEmail = async () => {
      called = true;
      return {} as never;
    };
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "grace@example.com");
    byText(el, "Send verification code")!.click();
    await settle(el);
    await type(el, "emailcode", "123");
    byText(el, "Confirm change")!.click();
    await settle(el);

    expect(called).to.be.false;
  });

  it("confirms with the code and the new address together", async () => {
    const { el, client } = await mountAccount();
    client.requestCode = async () => ({}) as never;
    let payload: unknown;
    client.changeEmail = async (input: unknown) => {
      payload = input;
      return {} as never;
    };
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "grace@example.com");
    byText(el, "Send verification code")!.click();
    await settle(el);
    await type(el, "emailcode", "123456");
    byText(el, "Confirm change")!.click();
    await settle(el);

    expect(payload).to.deep.contain({
      email: "ada@example.com",
      code: "123456",
      new_email: "grace@example.com"
    });
  });

  it("keeps the code field to six digits and strips non-digits", async () => {
    const { el, client } = await mountAccount();
    client.requestCode = async () => ({}) as never;
    byText(el, "Change email")!.click();
    await el.updateComplete;
    await type(el, "newemail", "grace@example.com");
    byText(el, "Send verification code")!.click();
    await settle(el);
    await type(el, "emailcode", "12ab34-5678");

    const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id$="emailcode"]')!;
    expect(input.value).to.equal("123456");
  });

  it("can be cancelled without changing anything", async () => {
    const { el } = await mountAccount();
    byText(el, "Change email")!.click();
    await el.updateComplete;
    byText(el, "Cancel")!.click();
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector('input[id$="newemail"]')).to.not.exist;
    expect(byText(el, "Change email")).to.exist;
  });
});
