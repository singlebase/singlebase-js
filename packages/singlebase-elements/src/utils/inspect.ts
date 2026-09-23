/**
 * Reads a few facts out of a file before it is uploaded: how many pages it
 * has, and whether it is encrypted. Everything here runs in the browser on
 * the bytes the user picked — no upload, no dependency, no worker.
 *
 * Two honest caveats, both of which the documentation repeats:
 *
 *  - **This is a convenience, not a security control.** Anyone can bypass it.
 *    The server still has to enforce whatever actually matters.
 *  - **Facts can be unknown.** A page count is `null` when the structure
 *    can't be read, and callers treat unknown as "rule doesn't apply" rather
 *    than rejecting a file they simply failed to parse.
 */

export interface FileFacts {
  /** Pages for PDF and DOCX, slides for PPTX. Null when undeterminable. */
  pages: number | null;
  /** True when encrypted, false when plainly not, null when unknown. */
  encrypted: boolean | null;
}

const UNKNOWN: FileFacts = { pages: null, encrypted: null };

/** How much of a large PDF to look at, from each end. */
const PDF_HEAD = 16 * 1024 * 1024;
const PDF_TAIL = 2 * 1024 * 1024;

/** Ceilings for the compressed-PDF fallback, so a hostile file can't stall the tab. */
const MAX_STREAMS = 40;
const MAX_INFLATED = 4 * 1024 * 1024;

const OOXML = new Set(["docx", "pptx", "xlsx"]);

/** Inspects one file. Never throws — an unreadable file is simply unknown. */
export async function inspectFile(file: Blob, extension: string): Promise<FileFacts> {
  try {
    if (extension === "pdf") return await inspectPdf(file);
    if (OOXML.has(extension)) return await inspectOoxml(file, extension);
  } catch {
    // A corrupt or surprising file is not a rejection reason on its own.
  }
  return UNKNOWN;
}

/** True when this extension has anything worth reading bytes for. */
export function isInspectable(extension: string): boolean {
  return extension === "pdf" || OOXML.has(extension);
}

// ── PDF ──────────────────────────────────────────────────────

async function inspectPdf(file: Blob): Promise<FileFacts> {
  const head = await bytesOf(file.slice(0, PDF_HEAD));
  const tail =
    file.size > PDF_HEAD ? await bytesOf(file.slice(Math.max(0, file.size - PDF_TAIL))) : null;

  const text = latin1(head) + (tail ? latin1(tail) : "");

  // An encrypted PDF names /Encrypt in its trailer. The whole file is still
  // readable — it is the content streams that are encrypted — so this is a
  // reliable marker rather than a guess.
  const encrypted = /\/Encrypt[\s/<>\]]/.test(text);

  let pages = pageCountIn(text);
  if (pages === null) pages = await pageCountInStreams(head);

  return { pages, encrypted };
}

/**
 * The page tree's root node carries `/Count` with the document total, so the
 * largest `/Count` next to a `/Pages` node is the answer. Files that write
 * the tree without counts fall back to counting `/Type /Page` objects.
 */
function pageCountIn(text: string): number | null {
  if (/\/Type\s*\/Pages/.test(text)) {
    let max = 0;
    for (const match of text.matchAll(/\/Count\s+(\d+)/g)) {
      max = Math.max(max, Number(match[1]));
    }
    if (max > 0) return max;
  }
  const direct = text.match(/\/Type\s*\/Page[^s]/g);
  return direct?.length ? direct.length : null;
}

/**
 * PDF 1.5 and later may pack the page tree into compressed object streams,
 * where a plain scan sees nothing. Inflating the streams and scanning the
 * result recovers the count, using only DecompressionStream.
 */
async function pageCountInStreams(bytes: Uint8Array): Promise<number | null> {
  if (typeof DecompressionStream === "undefined") return null;

  const text = latin1(bytes);
  let inflated = "";
  let streams = 0;

  for (const match of text.matchAll(/stream\r?\n/g)) {
    if (streams >= MAX_STREAMS || inflated.length >= MAX_INFLATED) break;
    const start = match.index! + match[0].length;
    let end = text.indexOf("endstream", start);
    if (end < 0) break;
    // Writers put an EOL between the data and the keyword. It has to come off:
    // the decompressor rejects anything trailing the compressed data.
    while (end > start && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1;
    streams += 1;
    try {
      const out = await inflate(bytes.subarray(start, end), "deflate");
      inflated += latin1(out);
    } catch {
      // Not a zlib stream (an image, or a different filter). Skip it.
    }
  }

  return inflated ? pageCountIn(inflated) : null;
}

// ── OOXML (docx / pptx / xlsx) ───────────────────────────────

async function inspectOoxml(file: Blob, extension: string): Promise<FileFacts> {
  const magic = await bytesOf(file.slice(0, 8));

  // A password-protected Office file is not a zip at all: Office encrypts the
  // package and wraps it in an OLE compound file. The magic bytes say so
  // outright, which makes this the one exact check in this module.
  if (isCompoundFile(magic)) return { pages: null, encrypted: true };
  if (magic[0] !== 0x50 || magic[1] !== 0x4b) return UNKNOWN;

  const app = await readZipEntry(file, "docProps/app.xml");
  if (!app) return { pages: null, encrypted: false };

  // Word records Pages, PowerPoint records Slides. Excel records neither.
  const tag = extension === "pptx" ? "Slides" : "Pages";
  const match = new TextDecoder().decode(app).match(new RegExp(`<${tag}>(\\d+)</${tag}>`));
  return { pages: match ? Number(match[1]) : null, encrypted: false };
}

function isCompoundFile(magic: Uint8Array): boolean {
  const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return SIGNATURE.every((byte, i) => magic[i] === byte);
}

/**
 * Pulls one entry out of a zip by walking the central directory. Enough of
 * the format to find a small known file, and no more: zip64 archives return
 * null, which reads as "unknown" upstream.
 */
async function readZipEntry(file: Blob, wanted: string): Promise<Uint8Array | null> {
  const tailSize = Math.min(file.size, 66_000);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const size = tail.getUint32(eocd + 12, true);
  const offset = tail.getUint32(eocd + 16, true);
  if (!size || offset === 0xffffffff) return null;

  const cd = new DataView(await file.slice(offset, offset + size).arrayBuffer());
  const decoder = new TextDecoder();
  let p = 0;

  while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50) {
    const method = cd.getUint16(p + 10, true);
    const compressed = cd.getUint32(p + 20, true);
    const nameLength = cd.getUint16(p + 28, true);
    const extraLength = cd.getUint16(p + 30, true);
    const commentLength = cd.getUint16(p + 32, true);
    const localOffset = cd.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLength));

    if (name === wanted) {
      // The central directory's name/extra lengths may differ from the local
      // header's, so the data offset has to come from the local header.
      const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
      const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      const data = await bytesOf(file.slice(start, start + compressed));
      if (method === 0) return data;
      if (method === 8 && typeof DecompressionStream !== "undefined") {
        return await inflate(data, "deflate-raw");
      }
      return null;
    }

    p += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

// ── plumbing ─────────────────────────────────────────────────

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function inflate(data: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Bytes as one char each, so PDF structure can be matched with a regex. */
function latin1(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 32_768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}
