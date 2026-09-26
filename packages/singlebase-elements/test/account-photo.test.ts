import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import "../src/elements/authui-account.js";
import type { SinglebaseAccountScreen } from "../src/elements/authui-account.js";
import type { SinglebaseUploader } from "../src/elements/uploader.js";
import { SETTINGS, authedState, signedInClient } from "./fixtures.js";
import { makeUserProfile } from "./mock-client.js";

async function mount(profile = makeUserProfile()) {
  const client = signedInClient(profile);
  const el = await fixture<SinglebaseAccountScreen>(
    html`<singlebase-authui-account></singlebase-authui-account>`
  );
  el.client = client as never;
  el.settings = SETTINGS as never;
  await el.updateComplete;
  return { el, client };
}

const uploaderOf = (el: SinglebaseAccountScreen) =>
  el.shadowRoot!.querySelector<SinglebaseUploader>("singlebase-uploader")!;

const photoLink = (el: SinglebaseAccountScreen) =>
  [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.edit-link")].find((b) =>
    /photo|Change|Uploading/.test(b.textContent!)
  )!;

/** Picks a file through the uploader's real <input type="file">. */
async function pick(el: SinglebaseAccountScreen, file: File) {
  const uploader = uploaderOf(el);
  await uploader.updateComplete;
  const input = uploader.shadowRoot!.querySelector<HTMLInputElement>("input[type=file]")!;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  for (let i = 0; i < 20; i++) await aTimeout(2);
  await el.updateComplete;
}

/** Answers the two API calls of an upload the way the server does. */
function fakeDispatcher() {
  const calls: { operation: string; payload: any }[] = [];
  return {
    calls,
    options: {},
    async dispatch(envelope: { operation: string; payload: any }) {
      calls.push(envelope);
      const files = envelope.payload.files as any[];
      if (envelope.operation === "files.initiate_upload") {
        return files.map((_, i) => ({
          id: `f${i}`,
          upload: { url: "https://storage.test/bucket", fields: { key: `k${i}` } },
          upload_token: `t${i}`
        }));
      }
      if (envelope.operation === "files.complete_upload") {
        return files.map((f) => ({ id: f.id }));
      }
      return [];
    }
  };
}

/** Stands in for the storage provider: every POST succeeds with a 204. */
async function withFakeStorage(run: () => Promise<void>) {
  class FakeXHR {
    upload: { onprogress: ((e: any) => void) | null } = { onprogress: null };
    status = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    abort() {}
    send() {
      setTimeout(() => {
        this.upload.onprogress?.({ loaded: 64, total: 64, lengthComputable: true });
        this.status = 204;
        this.onload?.();
      }, 0);
    }
  }
  const real = window.XMLHttpRequest;
  (window as any).XMLHttpRequest = FakeXHR;
  try {
    await run();
  } finally {
    (window as any).XMLHttpRequest = real;
  }
}

/** A real 1×1 PNG, so the new photo actually loads in the test browser. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const png = () => new File([new Uint8Array(64)], "me.png", { type: "image/png" });

describe("account — profile photo", () => {
  it("shows the photo when the profile has one", async () => {
    const { el } = await mount(makeUserProfile({ profile_photo: "https://cdn.example.com/p.png" }));
    const img = el.shadowRoot!.querySelector<HTMLImageElement>('[part="avatar-image"]');
    expect(img).to.exist;
    expect(img!.getAttribute("src")).to.equal("https://cdn.example.com/p.png");
  });

  it("shows initials when there is no photo", async () => {
    const { el } = await mount();
    expect(el.shadowRoot!.querySelector('[part="avatar-image"]')).to.equal(null);
    expect(el.shadowRoot!.querySelector('[part="avatar"]')!.textContent!.trim()).to.not.equal("");
  });

  it("falls back to initials when the photo won't load", async () => {
    const { el } = await mount(
      makeUserProfile({ profile_photo: "https://cdn.example.com/gone.png" })
    );
    el.shadowRoot!.querySelector('[part="avatar-image"]')!.dispatchEvent(new Event("error"));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('[part="avatar-image"]')).to.equal(null);
  });

  it("offers a live photo link backed by a picker limited to JPG, PNG and WebP", async () => {
    const { el } = await mount();
    expect(photoLink(el).disabled).to.equal(false);
    const uploader = uploaderOf(el);
    expect(uploader.accept).to.contain(".jpg");
    expect(uploader.accept).to.contain(".png");
    expect(uploader.accept).to.contain(".webp");
    expect(uploader.accept).to.not.contain("gif");
    expect(uploader.maxFiles).to.equal(1);
  });

  it("sends profile_photo with initiate_upload, then reads the account back", async () => {
    const { el, client } = await mount();
    const api = fakeDispatcher();
    (client as any).dispatcher = api;
    // A new dispatcher is a new client identity, so the widget rebinds.
    el.client = { ...(client as any) } as never;
    await el.updateComplete;

    (el.client as any).getAccount = async () => {
      const profile = makeUserProfile({ profile_photo: PIXEL });
      (client as any).setState(authedState(profile));
      return profile;
    };

    await withFakeStorage(() => pick(el, png()));

    const initiate = api.calls.find((c) => c.operation === "files.initiate_upload")!;
    expect(initiate.payload.files[0].options).to.deep.equal({ profile_photo: true });
    expect(initiate.payload.files[0].filename).to.equal("me.png");
    expect(api.calls.map((c) => c.operation)).to.include("files.complete_upload");
    expect(el.shadowRoot!.textContent).to.contain("Photo updated");
    expect(el.shadowRoot!.querySelector('[part="avatar-image"]')!.getAttribute("src")).to.equal(
      PIXEL
    );
  });

  it("refuses a GIF before anything is uploaded", async () => {
    const { el, client } = await mount();
    const api = fakeDispatcher();
    (client as any).dispatcher = api;
    el.client = { ...(client as any) } as never;
    await el.updateComplete;

    await pick(el, new File([new Uint8Array(8)], "anim.gif", { type: "image/gif" }));

    expect(api.calls).to.have.length(0);
    expect(el.shadowRoot!.textContent).to.contain("isn't an accepted file type");
  });
});

describe("account — two-factor", () => {
  it("is not shown at all", async () => {
    const { el } = await mount();
    expect(el.shadowRoot!.textContent).to.not.contain("Two-factor");
  });
});

describe("account — delete account", () => {
  it("is not shown at all", async () => {
    const { el } = await mount();
    expect(el.shadowRoot!.textContent).to.not.match(/delete account/i);
  });
});
