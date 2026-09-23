import { fixture, html, expect } from "@open-wc/testing";
import "../src/elements/guard.js";
import type { SinglebaseAuthGuard } from "../src/elements/guard.js";
import { signedInClient, signedOutClient } from "./fixtures.js";
import { makeUserProfile } from "./mock-client.js";

const visible = (el: Element | null) => !!el && !el.hasAttribute("hidden");

async function longForm(client: unknown) {
  const el = await fixture<SinglebaseAuthGuard>(html`
    <singlebase-authui-guard .client=${client as never}>
      <div slot="loading" id="loading">Checking…</div>
      <div slot="authenticated" id="in">Welcome</div>
      <div slot="unauthenticated" id="out">Please sign in</div>
    </singlebase-authui-guard>
  `);
  await el.updateComplete;
  return el;
}

describe("singlebase-authui-guard — long form", () => {
  it("shows the unauthenticated branch when signed out", async () => {
    const el = await longForm(signedOutClient());
    expect(visible(el.querySelector("#out"))).to.be.true;
    expect(visible(el.querySelector("#in"))).to.be.false;
  });

  it("shows the authenticated branch when signed in", async () => {
    const el = await longForm(signedInClient());
    expect(visible(el.querySelector("#in"))).to.be.true;
    expect(visible(el.querySelector("#out"))).to.be.false;
  });

  it("switches live when the session changes", async () => {
    const client = signedOutClient();
    const el = await longForm(client);
    expect(visible(el.querySelector("#out"))).to.be.true;

    const profile = makeUserProfile();
    client.setState({
      status: "authenticated",
      session: { user_profile: profile } as never,
      user: profile
    });
    await el.updateComplete;

    expect(visible(el.querySelector("#in"))).to.be.true;
  });
});

describe("singlebase-authui-guard — short form", () => {
  it("shows its children when the state matches", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard slot="authenticated" .client=${signedInClient() as never}>
        <span>Welcome</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    expect(el.hasAttribute("hidden")).to.be.false;
  });

  it("hides itself when the state does not match", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard slot="authenticated" .client=${signedOutClient() as never}>
        <span>Welcome</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    expect(el.hasAttribute("hidden")).to.be.true;
  });

  it("does not require per-child slot attributes", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard slot="unauthenticated" .client=${signedOutClient() as never}>
        <span id="bare">Sign in please</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    expect(el.hasAttribute("hidden")).to.be.false;
    expect(el.querySelector("#bare")!.hasAttribute("hidden")).to.be.false;
  });

  it("hides itself for an unknown state name rather than showing content", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard slot="nonsense" .client=${signedInClient() as never}>
        <span>secret</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    expect(el.hasAttribute("hidden")).to.be.true;
  });
});

describe("singlebase-authui-guard — predicate", () => {
  const withPredicate = async (predicate: unknown, profile = makeUserProfile()) => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard
        slot="authenticated"
        .client=${signedInClient(profile) as never}
        .predicate=${predicate as never}
      >
        <span>admin only</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    return el;
  };

  it("shows content when the profile matches", async () => {
    const el = await withPredicate({ email: "ada@example.com" });
    expect(el.activeState).to.equal("authenticated");
    expect(el.hasAttribute("hidden")).to.be.false;
  });

  it("hides content when the profile does not match", async () => {
    const el = await withPredicate({ email: "someone@else.com" });
    expect(el.activeState).to.equal("unauthenticated");
    expect(el.hasAttribute("hidden")).to.be.true;
  });

  it("filters on roles with $in", async () => {
    const admin = makeUserProfile({ roles: ["admin"] });
    const viewer = makeUserProfile({ roles: ["viewer"] });
    expect((await withPredicate({ roles: { $in: ["admin"] } }, admin)).activeState).to.equal(
      "authenticated"
    );
    expect((await withPredicate({ roles: { $in: ["admin"] } }, viewer)).activeState).to.equal(
      "unauthenticated"
    );
  });

  it("reaches nested values with dot notation", async () => {
    const profile = makeUserProfile({ metadata: { last_location: "xyz" } });
    expect(
      (await withPredicate({ "metadata.last_location": "xyz" }, profile)).activeState
    ).to.equal("authenticated");
    expect(
      (await withPredicate({ "metadata.last_location": "abc" }, profile)).activeState
    ).to.equal("unauthenticated");
  });

  it("parses a predicate given as a JSON attribute", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard
        slot="authenticated"
        predicate='{"email":"ada@example.com"}'
        .client=${signedInClient() as never}
      >
        <span>ok</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    expect(el.predicate).to.deep.equal({ email: "ada@example.com" });
    expect(el.activeState).to.equal("authenticated");
  });

  it("renders nothing at all under on-mismatch=hidden", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard
        slot="unauthenticated"
        on-mismatch="hidden"
        .client=${signedInClient() as never}
        .predicate=${{ email: "nobody@example.com" } as never}
      >
        <span>fallback</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    // "hidden" means neither branch shows, so the unauthenticated fallback
    // must not appear for a signed-in user who merely failed the filter.
    expect(el.activeState).to.equal("hidden");
    expect(el.hasAttribute("hidden")).to.be.true;
  });

  it("never lets a predicate promote a signed-out visitor", async () => {
    const el = await fixture<SinglebaseAuthGuard>(html`
      <singlebase-authui-guard
        slot="authenticated"
        .client=${signedOutClient() as never}
        .predicate=${{} as never}
      >
        <span>secret</span>
      </singlebase-authui-guard>
    `);
    await el.updateComplete;
    expect(el.activeState).to.equal("unauthenticated");
    expect(el.hasAttribute("hidden")).to.be.true;
  });

  it("with no predicate behaves exactly like an unfiltered guard", async () => {
    const el = await withPredicate(null);
    expect(el.activeState).to.equal("authenticated");
  });
});
