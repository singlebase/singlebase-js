import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import "../src/elements/uploader.js";
import type { SinglebaseUploader } from "../src/elements/uploader.js";
import { inspectFile, isInspectable } from "../src/utils/inspect.js";

// ── builders for the byte shapes the inspector reads ──────────

function bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function pdf(body: string): Blob {
  return new Blob([bytes(`%PDF-1.7\n${body}\n%%EOF\n`)], { type: "application/pdf" });
}

/** A PDF whose page tree names the total in the root /Pages node. */
function pdfWithPages(count: number): Blob {
  return pdf(
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
      `2 0 obj\n<< /Type /Pages /Count ${count} /Kids [3 0 R] >>\nendobj\n` +
      `3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n` +
      `trailer\n<< /Root 1 0 R >>`
  );
}

/** A zip built by hand, stored (uncompressed), with one entry. */
function zip(entries: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, 0, true); // crc, unchecked by the reader
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);

    const localBytes = new Uint8Array(30 + nameBytes.length + data.length);
    localBytes.set(new Uint8Array(local.buffer), 0);
    localBytes.set(nameBytes, 30);
    localBytes.set(data, 30 + nameBytes.length);
    locals.push(localBytes);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, 0, true); // stored
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);

    const centralBytes = new Uint8Array(46 + nameBytes.length);
    centralBytes.set(new Uint8Array(central.buffer), 0);
    centralBytes.set(nameBytes, 46);
    centrals.push(centralBytes);

    offset += localBytes.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, centrals.length, true);
  eocd.setUint16(10, centrals.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of [...locals, ...centrals, new Uint8Array(eocd.buffer)]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function docx(pages: number): Blob {
  return new Blob([
    zip({
      "[Content_Types].xml": "<Types/>",
      "docProps/app.xml": `<?xml version="1.0"?><Properties><Pages>${pages}</Pages></Properties>`
    }) as BlobPart
  ]);
}

function pptx(slides: number): Blob {
  return new Blob([
    zip({
      "docProps/app.xml": `<?xml version="1.0"?><Properties><Slides>${slides}</Slides></Properties>`
    }) as BlobPart
  ]);
}

/** An encrypted Office file: an OLE compound file, not a zip. */
function protectedOffice(): Blob {
  const header = new Uint8Array(512);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  return new Blob([header as BlobPart]);
}

// ── the inspector ─────────────────────────────────────────────

describe("inspectFile — PDF", () => {
  it("reads the page count from the page tree", async () => {
    expect((await inspectFile(pdfWithPages(12), "pdf")).pages).to.equal(12);
  });

  it("falls back to counting page objects when there is no /Count", async () => {
    const file = pdf(
      "1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\ntrailer\n<<>>"
    );
    expect((await inspectFile(file, "pdf")).pages).to.equal(2);
  });

  it("detects an encrypted PDF", async () => {
    const file = pdf("trailer\n<< /Root 1 0 R /Encrypt 9 0 R /ID [<aa><bb>] >>");
    const facts = await inspectFile(file, "pdf");
    expect(facts.encrypted).to.equal(true);
  });

  it("reports a plain PDF as not encrypted", async () => {
    expect((await inspectFile(pdfWithPages(3), "pdf")).encrypted).to.equal(false);
  });

  it("reads a page count out of a compressed object stream", async () => {
    // What a PDF 1.5+ writer produces: the page tree lives inside a
    // FlateDecode stream where a plain scan finds nothing.
    const inner = bytes("<< /Type /Pages /Count 42 /Kids [3 0 R] >>");
    const deflated = new Uint8Array(
      await new Response(
        new Blob([inner as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))
      ).arrayBuffer()
    );

    const head = bytes("%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n");
    const foot = bytes("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
    const file = new Blob([head as BlobPart, deflated as BlobPart, foot as BlobPart]);

    expect((await inspectFile(file, "pdf")).pages).to.equal(42);
  });

  it("returns unknown rather than guessing on an unreadable file", async () => {
    const facts = await inspectFile(new Blob([bytes("not a pdf at all")]), "pdf");
    expect(facts.pages).to.equal(null);
  });
});

describe("inspectFile — Office", () => {
  it("reads Pages out of a docx", async () => {
    const facts = await inspectFile(docx(20), "docx");
    expect(facts.pages).to.equal(20);
    expect(facts.encrypted).to.equal(false);
  });

  it("reads Slides out of a pptx", async () => {
    expect((await inspectFile(pptx(7), "pptx")).pages).to.equal(7);
  });

  it("detects a password-protected Office file by its container", async () => {
    const facts = await inspectFile(protectedOffice(), "docx");
    expect(facts.encrypted).to.equal(true);
  });

  it("has no page count for xlsx, and says so", async () => {
    const file = new Blob([zip({ "docProps/app.xml": "<Properties/>" }) as BlobPart]);
    const facts = await inspectFile(file, "xlsx");
    expect(facts.pages).to.equal(null);
    expect(facts.encrypted).to.equal(false);
  });

  it("leaves formats it cannot read alone", async () => {
    expect(isInspectable("pdf")).to.equal(true);
    expect(isInspectable("docx")).to.equal(true);
    expect(isInspectable("doc")).to.equal(false);
    expect(isInspectable("png")).to.equal(false);
    expect(await inspectFile(new Blob(["x"]), "png")).to.deep.equal({
      pages: null,
      encrypted: null
    });
  });
});

// ── the rules, through the element ────────────────────────────

async function mount(template: unknown) {
  const el = await fixture<SinglebaseUploader>(template as never);
  await el.updateComplete;
  return el;
}

async function dropBlob(el: SinglebaseUploader, blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type, lastModified: 1 });
  const event = new Event("drop") as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
  el.shadowRoot!.querySelector(".card")!.dispatchEvent(event);
  // Inspection reads bytes, so wait for it to settle rather than guessing.
  for (let i = 0; i < 50 && el.files.some((f) => f.status === "checking"); i++) {
    await aTimeout(1);
  }
  await aTimeout(1);
  await el.updateComplete;
}

const text = (el: SinglebaseUploader) => el.shadowRoot!.textContent!.replace(/\s+/g, " ");

describe("singlebase-uploader — rules", () => {
  it("refuses a PDF over maxPages and says how many it had", async () => {
    const el = await mount(
      html`<singlebase-uploader rules='{"pdf":{"maxPages":10}}'></singlebase-uploader>`
    );
    await dropBlob(el, pdfWithPages(24), "long.pdf");

    expect(el.files).to.have.length(0);
    expect(text(el)).to.contain("long.pdf has 24 pages; the limit is 10");
  });

  it("accepts a PDF within maxPages and shows the count", async () => {
    const el = await mount(
      html`<singlebase-uploader rules='{"pdf":{"maxPages":10}}'></singlebase-uploader>`
    );
    await dropBlob(el, pdfWithPages(4), "short.pdf");

    expect(el.files).to.have.length(1);
    expect(el.files[0].status).to.equal("ready");
    expect(el.files[0].pages).to.equal(4);
    expect(text(el)).to.contain("4 pages");
  });

  it("refuses a protected PDF when allowProtected is false", async () => {
    const el = await mount(
      html`<singlebase-uploader rules='{"pdf":{"allowProtected":false}}'></singlebase-uploader>`
    );
    await dropBlob(el, pdf("trailer\n<< /Encrypt 9 0 R >>"), "locked.pdf");

    expect(el.files).to.have.length(0);
    expect(text(el)).to.contain("locked.pdf is password protected");
  });

  it("allows a protected file when the rule doesn't forbid it", async () => {
    const el = await mount(
      html`<singlebase-uploader rules='{"pdf":{"maxPages":50}}'></singlebase-uploader>`
    );
    await dropBlob(el, pdf("trailer\n<< /Encrypt 9 0 R >>"), "locked.pdf");

    expect(el.files).to.have.length(1);
    expect(el.files[0].encrypted).to.equal(true);
  });

  it("applies docx rules, including the protected container", async () => {
    const el = await mount(
      html`<singlebase-uploader
        rules='{"docx":{"maxPages":20,"allowProtected":false}}'
      ></singlebase-uploader>`
    );

    await dropBlob(el, docx(45), "long.docx");
    expect(el.files).to.have.length(0);
    expect(text(el)).to.contain("has 45 pages");

    await dropBlob(el, protectedOffice(), "locked.docx");
    expect(el.files).to.have.length(0);
    expect(text(el)).to.contain("password protected");

    await dropBlob(el, docx(6), "fine.docx");
    expect(el.files).to.have.length(1);
  });

  it("a rule's own size bound overrides the element-wide one", async () => {
    const el = await mount(
      html`<singlebase-uploader
        max-size="25MB"
        rules='{"pdf":{"maxSize":"100B"}}'
      ></singlebase-uploader>`
    );
    await dropBlob(el, pdfWithPages(1), "small-limit.pdf");

    expect(el.files).to.have.length(0);
    expect(text(el)).to.contain("larger than");
  });

  it("does not apply a rule to a file it cannot read", async () => {
    const el = await mount(
      html`<singlebase-uploader
        rules='{"png":{"maxPages":1,"allowProtected":false}}'
      ></singlebase-uploader>`
    );
    await dropBlob(el, new Blob([bytes("\x89PNG")], { type: "image/png" }), "photo.png");

    expect(el.files).to.have.length(1);
    expect(el.files[0].status).to.equal("ready");
  });

  it("ignores a rules attribute that isn't valid JSON", async () => {
    const el = await mount(html`<singlebase-uploader rules="{oops"></singlebase-uploader>`);
    await dropBlob(el, pdfWithPages(99), "any.pdf");
    expect(el.files).to.have.length(1);
  });

  it("matches rule keys case-insensitively, with or without a dot", async () => {
    const el = await mount(
      html`<singlebase-uploader rules='{".PDF":{"maxPages":2}}'></singlebase-uploader>`
    );
    await dropBlob(el, pdfWithPages(9), "doc.pdf");
    expect(el.files).to.have.length(0);
  });
});
