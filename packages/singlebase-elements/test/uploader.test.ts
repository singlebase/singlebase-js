import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import "../src/elements/uploader.js";
import type { SinglebaseUploader } from "../src/elements/uploader.js";
import {
  acceptsFile,
  acceptSummary,
  extensionOf,
  fileKey,
  formatSize,
  parseSize,
  renameKeepingExtension
} from "../src/utils/files.js";

/** A client whose files.upload records what it was given and answers plainly. */
function uploadClient(
  behaviour: {
    failNames?: string[];
    throwOnInitiate?: boolean;
    progress?: boolean;
  } = {}
) {
  const calls: any[] = [];
  return {
    calls,
    files: {
      async upload(inputs: any[], options: any) {
        calls.push({ inputs, options });
        if (behaviour.throwOnInitiate) throw new Error("INITIATE_FAILED");
        const completed: any[] = [];
        const failed: any[] = [];
        for (const input of inputs) {
          if (behaviour.progress) {
            options?.onProgress?.({ input, id: "x", loaded: 50, total: 100, percent: 50 });
          }
          if (behaviour.failNames?.includes(input.filename)) {
            failed.push({ input, id: "id", error: { code: "UPLOAD_FAILED", message: "nope" } });
          } else {
            completed.push({ input, id: "id", file: { id: "id", name: input.filename } });
          }
        }
        return { completed, failed };
      }
    }
  };
}

function makeFile(name: string, size = 1024, type = "application/pdf"): File {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1 });
}

async function mount(template: unknown, client?: unknown) {
  const el = await fixture<SinglebaseUploader>(template as never);
  if (client) (el as { client: unknown }).client = client;
  await el.updateComplete;
  return el;
}

/** The element stages through a private path; this is the user-facing one. */
function drop(el: SinglebaseUploader, files: File[]) {
  const zone = el.shadowRoot!.querySelector(".card")!;
  const event = new Event("drop") as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  zone.dispatchEvent(event);
  return el.updateComplete;
}

const rows = (el: SinglebaseUploader) => el.shadowRoot!.querySelectorAll('[part="file"]');
const text = (el: SinglebaseUploader) => el.shadowRoot!.textContent!.replace(/\s+/g, " ");

describe("singlebase-uploader — staging", () => {
  it("stages dropped files and shows the count", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("a.pdf"), makeFile("b.pdf")]);

    expect(rows(el)).to.have.length(2);
    expect(el.files).to.have.length(2);
    expect(text(el)).to.contain("2 files of 10");
  });

  it("refuses a duplicate of a file already staged", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    const file = makeFile("a.pdf");
    await drop(el, [file]);
    await drop(el, [file]);

    expect(rows(el)).to.have.length(1);
    expect(text(el)).to.contain("already in the list");
  });

  it("stops at max-files", async () => {
    const el = await mount(html`<singlebase-uploader max-files="2"></singlebase-uploader>`);
    await drop(el, [makeFile("a.pdf"), makeFile("b.pdf"), makeFile("c.pdf")]);

    expect(rows(el)).to.have.length(2);
    expect(text(el)).to.contain("up to 2 files");
  });

  it("refuses files over max-size and keeps the rest", async () => {
    const el = await mount(html`<singlebase-uploader max-size="2KB"></singlebase-uploader>`);
    await drop(el, [makeFile("small.pdf", 100), makeFile("big.pdf", 9999)]);

    expect(rows(el)).to.have.length(1);
    expect(text(el)).to.contain("larger than");
  });

  it("refuses files under min-size", async () => {
    const el = await mount(html`<singlebase-uploader min-size="1KB"></singlebase-uploader>`);
    await drop(el, [makeFile("tiny.pdf", 10)]);

    expect(rows(el)).to.have.length(0);
    expect(text(el)).to.contain("smaller than");
  });

  it("refuses a type outside accept", async () => {
    const el = await mount(html`<singlebase-uploader accept=".pdf"></singlebase-uploader>`);
    await drop(el, [makeFile("photo.png", 100, "image/png")]);

    expect(rows(el)).to.have.length(0);
    expect(text(el)).to.contain("accepted file type");
  });

  it("removes a staged file", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("a.pdf"), makeFile("b.pdf")]);

    const remove = [...el.shadowRoot!.querySelectorAll("button")].find(
      (b) => b.textContent!.trim() === "Remove"
    )!;
    remove.click();
    await el.updateComplete;

    expect(rows(el)).to.have.length(1);
  });

  it("renames a file, keeping its extension", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("report.pdf")]);

    el.shadowRoot!.querySelector<HTMLButtonElement>("button.name")!.click();
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector<HTMLInputElement>(".name-input")!;
    input.value = "quarterly";
    input.dispatchEvent(new Event("blur"));
    await el.updateComplete;

    expect(el.files[0].name).to.equal("quarterly.pdf");
  });

  it("clear() empties the list", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("a.pdf")]);
    el.clear();
    await el.updateComplete;
    expect(rows(el)).to.have.length(0);
  });
});

describe("singlebase-uploader — uploading", () => {
  it("uploads staged files and reports the records", async () => {
    const client = uploadClient();
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`, client);
    await drop(el, [makeFile("a.pdf"), makeFile("b.pdf")]);

    let detail: any = null;
    el.addEventListener("singlebase-upload-complete", (e) => {
      detail = (e as CustomEvent).detail;
    });

    await el.upload();
    await el.updateComplete;

    expect(client.calls).to.have.length(1);
    expect(client.calls[0].inputs.map((i: any) => i.filename)).to.deep.equal(["a.pdf", "b.pdf"]);
    expect(detail.completed).to.have.length(2);
    expect(detail.failed).to.have.length(0);
    expect(el.files[0].status).to.equal("done");
    expect(el.files[0].record).to.deep.equal({ id: "id", name: "a.pdf" });
  });

  it("sends bucket, public-read and the renamed filename", async () => {
    const client = uploadClient();
    const el = await mount(
      html`<singlebase-uploader bucket="docs" public-read></singlebase-uploader>`,
      client
    );
    await drop(el, [makeFile("report.pdf")]);

    el.shadowRoot!.querySelector<HTMLButtonElement>("button.name")!.click();
    await el.updateComplete;
    const input = el.shadowRoot!.querySelector<HTMLInputElement>(".name-input")!;
    input.value = "quarterly";
    input.dispatchEvent(new Event("blur"));
    await el.updateComplete;

    await el.upload();

    expect(client.calls[0].inputs[0]).to.include({
      filename: "report.pdf",
      newName: "quarterly.pdf",
      bucket: "docs",
      publicRead: true
    });
  });

  it("keeps the good files and marks only the failed one", async () => {
    const client = uploadClient({ failNames: ["b.pdf"] });
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`, client);
    await drop(el, [makeFile("a.pdf"), makeFile("b.pdf")]);

    await el.upload();
    await el.updateComplete;

    expect(el.files[0].status).to.equal("done");
    expect(el.files[1].status).to.equal("error");
    expect(text(el)).to.contain("nope");
    // A failed row can be tried again.
    const retry = [...el.shadowRoot!.querySelectorAll("button")].find(
      (b) => b.textContent!.trim() === "Retry"
    );
    expect(retry).to.exist;
  });

  it("tracks per-file progress from the SDK", async () => {
    const client = uploadClient({ progress: true });
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`, client);
    await drop(el, [makeFile("a.pdf")]);

    let seen = 0;
    el.addEventListener("singlebase-upload-progress", (e) => {
      seen = (e as CustomEvent).detail.percent;
    });

    await el.upload();
    expect(seen).to.equal(50);
  });

  it("reports an error when the whole batch fails to initiate", async () => {
    const client = uploadClient({ throwOnInitiate: true });
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`, client);
    await drop(el, [makeFile("a.pdf")]);

    let message = "";
    el.addEventListener("singlebase-upload-error", (e) => {
      message = (e as CustomEvent).detail.message;
    });

    await el.upload();
    await el.updateComplete;

    expect(message).to.equal("INITIATE_FAILED");
    expect(el.files[0].status).to.equal("error");
  });

  it("says so when there is no client on the page", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("a.pdf")]);

    await el.upload();
    await el.updateComplete;

    expect(text(el)).to.contain("No Singlebase client");
  });

  it("auto-upload skips the review step", async () => {
    const client = uploadClient();
    const el = await mount(html`<singlebase-uploader auto-upload></singlebase-uploader>`, client);
    await drop(el, [makeFile("a.pdf")]);
    await aTimeout(0);
    await el.updateComplete;

    expect(client.calls).to.have.length(1);
    // No "Upload 1 file" button when the upload starts on its own.
    expect(text(el)).to.not.contain("Upload 1 file");
  });
});

describe("singlebase-uploader — views", () => {
  it("full view shows the dropzone until a file is staged", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    expect(text(el)).to.contain("Drag and drop files here");

    await drop(el, [makeFile("a.pdf")]);
    expect(text(el)).to.not.contain("Drag and drop files here");
    expect(text(el)).to.contain("Add more files");
  });

  it("dropzone='false' leaves just the picker", async () => {
    const el = await mount(html`<singlebase-uploader dropzone="false"></singlebase-uploader>`);
    expect(el.shadowRoot!.querySelector('[part="dropzone"]')).to.equal(null);
    expect(text(el)).to.contain("Add more files");
  });

  it("compact view shows the attachments row and the count", async () => {
    const el = await mount(
      html`<singlebase-uploader view="compact" max-files="10"></singlebase-uploader>`
    );
    expect(text(el)).to.contain("Attachments");
    expect(text(el)).to.contain("0 / 10");
    expect(text(el)).to.contain("Choose files");
  });

  it("button view is a single control that uploads on pick", async () => {
    const client = uploadClient();
    const el = await mount(
      html`<singlebase-uploader view="button" max-files="1"></singlebase-uploader>`,
      client
    );
    expect(el.shadowRoot!.querySelector(".card")).to.equal(null);
    expect(text(el)).to.contain("Choose file");
    expect(el.shadowRoot!.querySelector<HTMLInputElement>("input[type=file]")!.multiple).to.equal(
      false
    );
  });

  it("shows the hint built from accept and max-size", async () => {
    const el = await mount(
      html`<singlebase-uploader
        accept=".pdf,.png,image/jpeg"
        max-size="25MB"
      ></singlebase-uploader>`
    );
    expect(text(el)).to.contain("PDF, PNG, JPEG · up to 25.0 MB each");
  });

  it("renders the branding credit, and hides it on request", async () => {
    const on = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    expect(text(on)).to.contain("Files by Singlebase");

    const off = await mount(html`<singlebase-uploader branding="false"></singlebase-uploader>`);
    expect(text(off)).to.not.contain("Files by Singlebase");
  });

  it("the branding credit makes no network request", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    const branding = el.shadowRoot!.querySelector('[part="branding"]')!;
    expect(branding.querySelectorAll("img, iframe, script")).to.have.length(0);
    expect(branding.querySelector("a")!.getAttribute("rel")).to.contain("noopener");
  });
});

describe("file helpers", () => {
  it("parses human sizes", () => {
    expect(parseSize("25MB")).to.equal(26214400);
    expect(parseSize("500 kb")).to.equal(512000);
    expect(parseSize(2048)).to.equal(2048);
    expect(parseSize("")).to.equal(0);
    expect(parseSize("nonsense")).to.equal(0);
  });

  it("formats sizes", () => {
    expect(formatSize(512)).to.equal("512 B");
    expect(formatSize(2048)).to.equal("2 KB");
    expect(formatSize(1048576)).to.equal("1.0 MB");
  });

  it("matches the accept vocabulary", () => {
    expect(acceptsFile("", "a.exe", "application/x-msdownload")).to.equal(true);
    expect(acceptsFile(".pdf", "a.PDF", "")).to.equal(true);
    expect(acceptsFile("image/*", "a.png", "image/png")).to.equal(true);
    expect(acceptsFile("image/*", "a.pdf", "application/pdf")).to.equal(false);
    expect(acceptsFile("application/pdf", "a.pdf", "application/pdf")).to.equal(true);
  });

  it("summarizes accept for the hint line", () => {
    expect(acceptSummary(".pdf,.png,image/jpeg")).to.equal("PDF, PNG, JPEG");
    expect(acceptSummary("")).to.equal("");
  });

  it("reads an extension, and tolerates none", () => {
    expect(extensionOf("a.pdf")).to.equal("PDF");
    expect(extensionOf("README")).to.equal("");
    expect(extensionOf(".gitignore")).to.equal("");
  });

  it("keys a file by name, size and mtime", () => {
    expect(fileKey({ name: "a.pdf", size: 10, lastModified: 5 })).to.equal("a.pdf:10:5");
  });

  it("renames without losing or doubling the extension", () => {
    expect(renameKeepingExtension("a.pdf", "b")).to.equal("b.pdf");
    expect(renameKeepingExtension("a.pdf", "b.pdf")).to.equal("b.pdf");
    expect(renameKeepingExtension("a.pdf", "  ")).to.equal("a.pdf");
    expect(renameKeepingExtension("a.pdf", "../../etc/passwd")).to.equal("....etcpasswd.pdf");
  });
});

describe("singlebase-uploader — shared metadata and options", () => {
  it("attaches the same metadata and options to every file", async () => {
    const client = uploadClient();
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`, client);
    el.metadata = { folder: "q3", owner: "ada" };
    el.options = { profile_photo: false };
    await drop(el, [makeFile("a.pdf"), makeFile("b.pdf")]);

    await el.upload();

    for (const input of client.calls[0].inputs) {
      expect(input.metadata).to.deep.equal({ folder: "q3", owner: "ada" });
      expect(input.options).to.deep.equal({ profile_photo: false });
    }
  });

  it("reads metadata from JSON in markup", async () => {
    const client = uploadClient();
    const el = await mount(
      html`<singlebase-uploader metadata='{"folder":"inbox"}'></singlebase-uploader>`,
      client
    );
    await drop(el, [makeFile("a.pdf")]);
    await el.upload();
    expect(client.calls[0].inputs[0].metadata).to.deep.equal({ folder: "inbox" });
  });

  it("sends neither when none is set", async () => {
    const client = uploadClient();
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`, client);
    await drop(el, [makeFile("a.pdf")]);
    await el.upload();
    expect(client.calls[0].inputs[0]).to.not.have.property("metadata");
    expect(client.calls[0].inputs[0]).to.not.have.property("options");
  });
});

describe("singlebase-uploader — config", () => {
  it("applies several settings at once and ignores unknown keys", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    el.config = {
      maxFiles: 3,
      accept: ".pdf",
      metadata: { folder: "x" },
      view: "compact",
      nonsense: true
    } as never;
    await el.updateComplete;

    expect(el.maxFiles).to.equal(3);
    expect(el.accept).to.equal(".pdf");
    expect(el.metadata).to.deep.equal({ folder: "x" });
    expect(el.view).to.equal("compact");
    expect((el as any).nonsense).to.equal(undefined);
    expect(el.config.maxFiles).to.equal(3);
  });
});

describe("singlebase-uploader — previews", () => {
  it("shows a thumbnail for images and a type chip for everything else", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("photo.png", 100, "image/png"), makeFile("doc.pdf")]);

    const chips = el.shadowRoot!.querySelectorAll('[part="file-type"]');
    const thumb = chips[0].querySelector("img");
    expect(thumb).to.exist;
    expect(thumb!.getAttribute("src")).to.match(/^blob:/);
    expect(chips[1].querySelector("img")).to.equal(null);
    expect(chips[1].textContent!.trim()).to.equal("PDF");
  });

  it("releases the thumbnail when the file is removed", async () => {
    const el = await mount(html`<singlebase-uploader></singlebase-uploader>`);
    await drop(el, [makeFile("photo.png", 100, "image/png")]);
    const url = el.files[0].preview;

    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (u: string) => {
      revoked.push(u);
      original.call(URL, u);
    };
    try {
      el.clear();
    } finally {
      URL.revokeObjectURL = original;
    }
    expect(revoked).to.deep.equal([url]);
  });
});

describe("singlebase-uploader — rejections and reuse", () => {
  it("reports a rejected file as an event", async () => {
    const el = await mount(html`<singlebase-uploader accept=".pdf"></singlebase-uploader>`);
    let message = "";
    el.addEventListener("singlebase-upload-rejected", (e) => {
      message = (e as CustomEvent).detail.message;
    });
    await drop(el, [makeFile("photo.png", 100, "image/png")]);
    expect(message).to.contain("isn't an accepted file type");
  });

  it("button view accepts a new pick after the last one finished", async () => {
    const client = uploadClient();
    const el = await mount(
      html`<singlebase-uploader view="button" max-files="1"></singlebase-uploader>`,
      client
    );
    const pickFile = async (file: File) => {
      const input = el.shadowRoot!.querySelector<HTMLInputElement>("input[type=file]")!;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
      for (let i = 0; i < 10; i++) await aTimeout(1);
      await el.updateComplete;
    };

    await pickFile(makeFile("one.pdf"));
    await pickFile(makeFile("two.pdf"));

    expect(client.calls).to.have.length(2);
    expect(el.files.map((f) => f.name)).to.deep.equal(["two.pdf"]);
  });
});
