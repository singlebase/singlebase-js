import { fixture, html, expect } from "@open-wc/testing";
import "../src/elements/display.js";
import type { SinglebaseAuthDisplay } from "../src/elements/display.js";
import { signedInClient, signedOutClient } from "./fixtures.js";
import { createMockClient, makeUserProfile } from "./mock-client.js";

async function mount(template: unknown, client: unknown) {
  const el = await fixture<SinglebaseAuthDisplay>(template as never);
  (el as { client: unknown }).client = client;
  await el.updateComplete;
  return el;
}

const textOf = (el: SinglebaseAuthDisplay) => el.shadowRoot!.textContent!.trim();

describe("singlebase-authui-display — text", () => {
  it("renders the value at a top-level path", async () => {
    const el = await mount(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`,
      signedInClient()
    );
    expect(textOf(el)).to.equal("Ada");
  });

  it("reaches nested values with dot notation", async () => {
    const client = signedInClient(makeUserProfile({ metadata: { tier: "pro" } }));
    const el = await mount(
      html`<singlebase-authui-display path="metadata.tier"></singlebase-authui-display>`,
      client
    );
    expect(textOf(el)).to.equal("pro");
  });

  it("shows the fallback when signed out", async () => {
    const el = await mount(
      html`<singlebase-authui-display
        path="first_name"
        fallback="there"
      ></singlebase-authui-display>`,
      signedOutClient()
    );
    expect(textOf(el)).to.equal("there");
  });

  it("shows the fallback when the field is empty", async () => {
    const client = signedInClient(makeUserProfile({ first_name: null }));
    const el = await mount(
      html`<singlebase-authui-display
        path="first_name"
        fallback="there"
      ></singlebase-authui-display>`,
      client
    );
    expect(textOf(el)).to.equal("there");
  });

  it("renders nothing when signed out and no fallback was given", async () => {
    const el = await mount(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`,
      signedOutClient()
    );
    expect(textOf(el)).to.equal("");
  });

  it("renders nothing at all while auth state is loading", async () => {
    // Showing the fallback here would flash "there" before "Ada" on every load.
    const loading = createMockClient({ status: "loading", session: null, user: null });
    const el = await mount(
      html`<singlebase-authui-display
        path="first_name"
        fallback="there"
      ></singlebase-authui-display>`,
      loading
    );
    expect(textOf(el)).to.equal("");
  });

  it("updates when the profile changes", async () => {
    const client = signedInClient();
    const el = await mount(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`,
      client
    );
    expect(textOf(el)).to.equal("Ada");

    const renamed = makeUserProfile({ first_name: "Grace" });
    client.setState({
      status: "authenticated",
      session: { user_profile: renamed } as never,
      user: renamed
    });
    await el.updateComplete;

    expect(textOf(el)).to.equal("Grace");
  });

  it("joins array values rather than printing [object Object]", async () => {
    const client = signedInClient(makeUserProfile({ roles: ["admin", "editor"] }));
    const el = await mount(
      html`<singlebase-authui-display path="roles"></singlebase-authui-display>`,
      client
    );
    expect(textOf(el)).to.equal("admin, editor");
  });

  it("treats an object value as absent instead of dumping it", async () => {
    const client = signedInClient(makeUserProfile({ metadata: { a: 1 } }));
    const el = await mount(
      html`<singlebase-authui-display path="metadata" fallback="—"></singlebase-authui-display>`,
      client
    );
    expect(textOf(el)).to.equal("—");
  });

  it("renders a value as text, never as markup", async () => {
    // first_name is supplied by the user at signup, so it is untrusted.
    const client = signedInClient(makeUserProfile({ first_name: "<img src=x onerror=alert(1)>" }));
    const el = await mount(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`,
      client
    );
    expect(el.shadowRoot!.querySelector("img")).to.not.exist;
    expect(textOf(el)).to.contain("<img");
  });

  it("cannot reach session or token data", async () => {
    const el = await mount(
      html`<singlebase-authui-display path="id_token" fallback="—"></singlebase-authui-display>`,
      signedInClient()
    );
    // Paths resolve against user_profile only, so the session is unreachable.
    expect(textOf(el)).to.equal("—");
  });
});

describe("singlebase-authui-display — avatar", () => {
  const withPhoto = (url: string | null) => signedInClient(makeUserProfile({ profile_photo: url }));

  it("renders an image from profile_photo by default", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      withPhoto("https://example.com/ada.jpg")
    );
    const img = el.shadowRoot!.querySelector("img");
    expect(img).to.exist;
    expect(img!.getAttribute("src")).to.equal("https://example.com/ada.jpg");
  });

  it("takes the image from another path when given one", async () => {
    const client = signedInClient(
      makeUserProfile({
        profile_photo: null,
        metadata: { avatar_url: "https://example.com/m.png" }
      })
    );
    const el = await mount(
      html`<singlebase-authui-display
        avatar
        path="metadata.avatar_url"
      ></singlebase-authui-display>`,
      client
    );
    expect(el.shadowRoot!.querySelector("img")!.getAttribute("src")).to.equal(
      "https://example.com/m.png"
    );
  });

  it("falls back to initials when there is no photo", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      withPhoto(null)
    );
    expect(el.shadowRoot!.querySelector("img")).to.not.exist;
    expect(textOf(el)).to.equal("AL");
  });

  it("falls back to initials when the image fails to load", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      withPhoto("https://example.invalid/nope.jpg")
    );
    const img = el.shadowRoot!.querySelector("img")!;
    img.dispatchEvent(new Event("error"));
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector("img")).to.not.exist;
    expect(textOf(el)).to.equal("AL");
  });

  it("uses the email initial when the profile has no name", async () => {
    const client = signedInClient(
      makeUserProfile({
        first_name: null,
        last_name: null,
        profile_photo: null,
        email: "zoe@x.com"
      })
    );
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      client
    );
    expect(textOf(el)).to.equal("Z");
  });

  it("is decorative by default, since a name usually sits beside it", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      withPhoto("https://example.com/ada.jpg")
    );
    expect(el.shadowRoot!.querySelector("img")!.getAttribute("alt")).to.equal("");
  });

  it("passes alt through when the avatar is the sole identifier", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar alt="Your photo"></singlebase-authui-display>`,
      withPhoto("https://example.com/ada.jpg")
    );
    expect(el.shadowRoot!.querySelector("img")!.getAttribute("alt")).to.equal("Your photo");
  });

  it("hides the initials from screen readers when decorative", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      withPhoto(null)
    );
    expect(el.shadowRoot!.querySelector("span")!.getAttribute("aria-hidden")).to.equal("true");
  });

  it("renders nothing when signed out", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      signedOutClient()
    );
    expect(el.shadowRoot!.querySelector("img")).to.not.exist;
    expect(textOf(el)).to.equal("");
  });

  it("reflects the avatar attribute so hosts can select on it", async () => {
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      withPhoto(null)
    );
    expect(el.hasAttribute("avatar")).to.be.true;
    expect(getComputedStyle(el).display).to.equal("inline-block");
  });

  it("sits inline as text, so it works inside a sentence", async () => {
    const el = await mount(
      html`<singlebase-authui-display path="first_name"></singlebase-authui-display>`,
      signedInClient()
    );
    expect(getComputedStyle(el).display).to.equal("inline");
  });

  it("retries the image when the path changes", async () => {
    const client = signedInClient(
      makeUserProfile({
        profile_photo: "https://example.invalid/a.jpg",
        metadata: { avatar_url: "https://example.com/b.png" }
      })
    );
    const el = await mount(
      html`<singlebase-authui-display avatar></singlebase-authui-display>`,
      client
    );
    el.shadowRoot!.querySelector("img")!.dispatchEvent(new Event("error"));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("img")).to.not.exist;

    el.path = "metadata.avatar_url";
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("img")!.getAttribute("src")).to.equal(
      "https://example.com/b.png"
    );
  });
});
