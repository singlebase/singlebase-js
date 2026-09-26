import { expect, aTimeout } from "@open-wc/testing";
import "../src/elements/authui.js";
import { mountWidget, signedOutClient } from "./fixtures.js";

/**
 * The callback is a screen of <singlebase-authui> rather than its own tag, so
 * these drive it the way a provider does: by putting the parameters on the URL
 * and mounting the widget.
 */
const originalUrl = globalThis.location.href;

function withSearch(search: string) {
  history.replaceState({}, "", search ? `${location.pathname}?${search}` : location.pathname);
}

afterEach(() => history.replaceState({}, "", originalUrl));

describe("oauth callback screen", () => {
  it("is not entered on an ordinary page load", async () => {
    withSearch("");
    const { el } = await mountWidget();
    expect(el.shadowRoot!.textContent).to.not.contain("Finishing sign-in");
  });

  it("is entered when the provider returns an access_code", async () => {
    withSearch("access_code=abc123");
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");

    const client = signedOutClient();
    client.completeOAuth = async () => new Promise(() => {}); // stays pending
    const { el } = await mountWidget({}, client);
    await aTimeout(0);

    expect(el.shadowRoot!.textContent).to.contain("Finishing sign-in");
    expect(el.shadowRoot!.querySelector(".spinner")).to.exist;
  });

  it("exchanges the code with the stored nonce", async () => {
    withSearch("access_code=abc123");
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");

    const client = signedOutClient();
    let received: unknown;
    client.completeOAuth = async (input: unknown) => {
      received = input;
      return {} as never;
    };
    await mountWidget({}, client);
    await aTimeout(0);

    expect(received).to.deep.contain({ access_code: "abc123", nonce: "nonce-1" });
  });

  it("clears the nonce once the exchange succeeds", async () => {
    withSearch("access_code=abc123");
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");

    const client = signedOutClient();
    client.completeOAuth = async () => ({}) as never;
    await mountWidget({}, client);
    await aTimeout(0);

    expect(sessionStorage.getItem("singlebase-oauth-nonce")).to.be.null;
  });

  it("scrubs the code off the URL so a reload cannot replay it", async () => {
    withSearch("access_code=abc123&keep=me");
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");

    const client = signedOutClient();
    client.completeOAuth = async () => ({}) as never;
    await mountWidget({}, client);
    await aTimeout(0);

    const params = new URLSearchParams(location.search);
    expect(params.has("access_code")).to.be.false;
    expect(params.get("keep")).to.equal("me"); // unrelated params survive
  });

  it("reports a denied sign-in instead of exchanging anything", async () => {
    withSearch("error=oauth_denied");

    const client = signedOutClient();
    let called = false;
    client.completeOAuth = async () => {
      called = true;
      return {} as never;
    };
    const { el } = await mountWidget({}, client);
    await aTimeout(0);

    expect(called).to.be.false;
    expect(el.shadowRoot!.textContent).to.contain("cancelled or denied");
    expect(new URLSearchParams(location.search).has("error")).to.be.false;
  });

  it("refuses to exchange a code with no matching nonce", async () => {
    withSearch("access_code=abc123");
    sessionStorage.removeItem("singlebase-oauth-nonce");

    const client = signedOutClient();
    let called = false;
    client.completeOAuth = async () => {
      called = true;
      return {} as never;
    };
    const { el } = await mountWidget({}, client);
    await aTimeout(0);

    // Without a nonce this response cannot be tied to a flow this browser
    // started, so exchanging it would be unsafe.
    expect(called).to.be.false;
    expect(el.shadowRoot!.querySelector(".banner")).to.exist;
  });

  it("exchanges only once, even across re-renders", async () => {
    withSearch("access_code=abc123");
    sessionStorage.setItem("singlebase-oauth-nonce", "nonce-1");

    const client = signedOutClient();
    let calls = 0;
    client.completeOAuth = async () => {
      calls += 1;
      return {} as never;
    };
    const { el } = await mountWidget({}, client);
    await aTimeout(0);

    el.requestUpdate();
    await el.updateComplete;
    await aTimeout(0);

    expect(calls).to.equal(1);
  });

  it("offers a way back after a failure", async () => {
    withSearch("error=oauth_denied");
    const { el } = await mountWidget();
    await aTimeout(0);

    const back = [...el.shadowRoot!.querySelectorAll("button")].find((b) =>
      b.textContent!.includes("Back")
    );
    expect(back).to.exist;
  });
});
