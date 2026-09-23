import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getDefaultClient } from "@singlebase/core";
import type {
  FileUploadInput,
  FilesUploadApi,
  SinglebaseClientInstance,
  UploadProgress
} from "@singlebase/singlebase-sdk";

/** What the uploader needs from a client: `files.upload`, and nothing else. */
export type UploaderClient = { files: Pick<FilesUploadApi, "upload"> };
import { tokenDefaults } from "../styles/tokens.js";
import { sharedStyles } from "../styles/shared.js";
import { fill, resolveUploadMessages, type SinglebaseUploadMessages } from "../upload-messages.js";
import { resolveRedirectTarget } from "../utils/redirect.js";
import {
  acceptSummary,
  acceptsFile,
  extensionOf,
  fileExtension,
  fileKey,
  formatSize,
  parseSize,
  renameKeepingExtension
} from "../utils/files.js";
import { inspectFile, isInspectable } from "../utils/inspect.js";

/** JSON in markup, an object in JavaScript. Bad JSON is ignored, not thrown. */
const jsonAttr = {
  fromAttribute: (value: string | null) => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      console.warn("[singlebase-uploader] an attribute holds invalid JSON; ignoring it");
      return {};
    }
  },
  toAttribute: (value: unknown) => JSON.stringify(value ?? {})
};

/** Present-but-empty means true, so `dropzone` and `dropzone="false"` both read. */
const flagAttr = {
  fromAttribute: (value: string | null) => (value === null ? true : value !== "false"),
  toAttribute: (value: boolean) => (value ? null : "false")
};

export type UploadView = "full" | "compact" | "button";
export type UploadItemStatus = "checking" | "ready" | "uploading" | "done" | "error";

/**
 * Per-format limits, keyed by extension: `{ pdf: { maxPages: 10 } }`.
 *
 * `maxPages` and `allowProtected` need the file's bytes read, which only
 * works for `pdf`, `docx`, `pptx` and `xlsx`; the size bounds apply to any
 * extension and override the element-wide ones for that kind.
 */
export interface FileRule {
  maxPages?: number;
  maxSize?: string | number;
  minSize?: string | number;
  /** Set false to refuse password-protected files. Default: allowed. */
  allowProtected?: boolean;
}

export type FileRules = Record<string, FileRule>;

export interface UploadItem {
  /** Identity for de-duplication: name, size and mtime. */
  key: string;
  file: File;
  /** The saved name, which the user may have edited. */
  name: string;
  status: UploadItemStatus;
  percent: number;
  error: string;
  /** The stored file record, once the upload completes. */
  record: unknown;
  /** Pages (slides for pptx) when they could be read, else null. */
  pages: number | null;
  /** Whether the file is encrypted, when that could be determined. */
  encrypted: boolean | null;
  /** A local object URL for image thumbnails; "" for everything else. */
  preview: string;
}

/**
 * Every setting in one object, for configuring an element from script. Keys
 * are the element's property names.
 */
export interface UploaderConfig {
  view: UploadView;
  dropzone: boolean;
  allowRename: boolean;
  autoUpload: boolean;
  branding: boolean;
  logoUrl: string;
  logoText: string;
  heading: string;
  description: string;
  maxFiles: number;
  maxSize: string | number;
  minSize: string | number;
  accept: string;
  rules: FileRules;
  bucket: string;
  publicRead: boolean;
  redirectUrl: string;
  metadata: Record<string, unknown>;
  options: Record<string, unknown>;
  messages: Partial<SinglebaseUploadMessages>;
  theme: "light" | "dark";
  density: "comfortable" | "compact";
  onComplete: SinglebaseUploader["onComplete"];
  onError: SinglebaseUploader["onError"];
}

const CONFIG_KEYS: readonly (keyof UploaderConfig)[] = [
  "view",
  "dropzone",
  "allowRename",
  "autoUpload",
  "branding",
  "logoUrl",
  "logoText",
  "heading",
  "description",
  "maxFiles",
  "maxSize",
  "minSize",
  "accept",
  "rules",
  "bucket",
  "publicRead",
  "redirectUrl",
  "metadata",
  "options",
  "messages",
  "theme",
  "density",
  "onComplete",
  "onError"
];

/**
 * A file picker that uploads straight to storage.
 *
 *   <singlebase-uploader></singlebase-uploader>
 *   <singlebase-uploader view="compact" accept=".pdf,image/*"></singlebase-uploader>
 *   <singlebase-uploader view="button" max-files="1"></singlebase-uploader>
 *
 * It owns the staging list — picking, renaming, removing, validating, and the
 * progress of each file — and nothing else. When the batch finishes it emits
 * the stored records and stops; what the application does with them (attach
 * them to a record, show a gallery, save an avatar) is the application's
 * decision, not the widget's.
 *
 * Failures are per file. One rejected upload leaves the rest completed and
 * offers that row a retry, mirroring the SDK's own behaviour.
 */
@customElement("singlebase-uploader")
export class SinglebaseUploader extends LitElement {
  static styles = [
    tokenDefaults,
    sharedStyles,
    css`
      .card {
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-sizing: border-box;
        padding: var(--sb-pad, 20px);
        background: var(--sb-surface, #ffffff);
        color: var(--sb-ink, #16181a);
        border: 1px solid var(--sb-border, #e4e6e9);
        border-radius: calc(var(--sb-radius, 4px) + 4px);
      }

      .logo-img {
        display: block;
        align-self: flex-start;
        height: var(--sb-logo-height, 20px);
        width: auto;
        max-width: 100%;
      }

      .brand-mark {
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sb-ink, #16181a);
      }

      .head-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .count {
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 11.5px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--sb-muted-ink, #61666c);
      }

      /* ── dropzone ─────────────────────────────────────── */
      .drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 30px 20px;
        text-align: center;
        border: 1px dashed var(--sb-border-strong, #cdd1d6);
        border-radius: calc(var(--sb-radius, 4px) + 2px);
        background: var(--sb-surface, #ffffff);
        transition:
          border-color 0.15s,
          background 0.15s;
      }

      .drop[data-drag="true"] {
        border-color: var(--sb-accent, #111111);
        background: var(--sb-surface-alt, #fafafa);
      }

      .arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        margin-bottom: 4px;
        font-size: 18px;
        line-height: 1;
        border: 1px solid var(--sb-border, #e4e6e9);
        border-radius: 50%;
        color: var(--sb-ink, #16181a);
      }

      .drop-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--sb-ink, #16181a);
      }

      /* the compact single-line dropzone */
      .strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--sb-border, #e4e6e9);
        border-radius: calc(var(--sb-radius, 4px) + 2px);
        background: var(--sb-surface-alt, #fafafa);
        transition:
          border-color 0.15s,
          background 0.15s;
      }

      .strip[data-drag="true"] {
        border-color: var(--sb-accent, #111111);
      }

      .strip-label {
        font-size: 14px;
        color: var(--sb-muted-ink, #61666c);
      }

      /* ── file rows ────────────────────────────────────── */
      .rows {
        display: flex;
        flex-direction: column;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-top: 1px solid var(--sb-border, #e4e6e9);
      }

      .rows .row:first-child {
        border-top: none;
      }

      .chip {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 46px;
        height: 46px;
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 10.5px;
        letter-spacing: 0.04em;
        color: var(--sb-muted-ink, #61666c);
        background: var(--sb-surface-alt, #fafafa);
        border: 1px solid var(--sb-border, #e4e6e9);
        border-radius: var(--sb-radius, 4px);
        overflow: hidden;
      }

      .thumb {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .name {
        font-size: 14px;
        font-weight: 500;
        color: var(--sb-ink, #16181a);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      button.name {
        align-self: flex-start;
        max-width: 100%;
        padding: 0;
        border: none;
        background: none;
        text-align: left;
        border-radius: 0;
      }

      button.name:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .name-input {
        font-size: 14px;
        padding: 6px 8px;
      }

      .sz {
        font-size: 12px;
        color: var(--sb-muted-ink, #61666c);
      }

      .sz[data-state="error"] {
        color: var(--sb-danger, #b4231a);
      }

      .sz[data-state="done"] {
        color: var(--sb-ok, #0f6b4a);
      }

      .bar {
        height: 3px;
        margin-top: 2px;
        border-radius: 999px;
        background: var(--sb-border, #e4e6e9);
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        background: var(--sb-accent, #111111);
        transition: width 0.2s linear;
      }

      .row-act {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      /* ── the dashed "add more" affordance ─────────────── */
      button.add-more {
        width: 100%;
        padding: 14px;
        color: var(--sb-ink, #16181a);
        background: none;
        border: 1px dashed var(--sb-border-strong, #cdd1d6);
        border-radius: calc(var(--sb-radius, 4px) + 2px);
      }

      button.add-more:hover:not(:disabled) {
        background: var(--sb-surface-alt, #fafafa);
      }

      button.wide {
        width: 100%;
        padding: 13px;
        font-size: 14px;
      }

      .branding {
        text-align: center;
        font-family: var(--sb-mono, "Geist Mono", ui-monospace, monospace);
        font-size: 10.5px;
        letter-spacing: 0.06em;
        color: var(--sb-muted-ink, #61666c);
      }

      .branding a {
        color: inherit;
        text-decoration: none;
      }

      .branding a:hover {
        color: var(--sb-ink, #16181a);
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      /* the button view is just a control, not a card */
      :host([view="button"]) {
        display: inline-block;
      }

      .button-view {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `
  ];

  // ── wiring ────────────────────────────────────────────────
  /** An explicit client. Omit it and the page's SinglebaseClient() is used. */
  @property({ attribute: false })
  accessor client: UploaderClient | null = null;

  @property({ attribute: false })
  accessor messages: Partial<SinglebaseUploadMessages> = {};

  @property({ reflect: true })
  accessor theme: "light" | "dark" | undefined = undefined;

  @property({ reflect: true })
  accessor density: "comfortable" | "compact" | undefined = undefined;

  // ── shape ─────────────────────────────────────────────────
  /**
   * `full` is the card with a dropzone and a reviewable list, `compact` the
   * one-line attachments row, `button` a single control that uploads as soon
   * as a file is chosen.
   */
  @property({ reflect: true })
  accessor view: UploadView = "full";

  /** Show the drop target. Off leaves the picker button on its own. */
  @property({ converter: flagAttr })
  accessor dropzone = true;

  /** Let the user edit the saved filename before uploading. */
  @property({ converter: flagAttr, attribute: "allow-rename" })
  accessor allowRename = true;

  /** Upload as soon as files are picked, with no review step. */
  @property({ type: Boolean, attribute: "auto-upload" })
  accessor autoUpload = false;

  /** The "Files by Singlebase" credit. A plain link — it makes no request. */
  @property({ converter: flagAttr })
  accessor branding = true;

  @property({ attribute: "logo-url" }) accessor logoUrl = "";
  @property({ attribute: "logo-text" }) accessor logoText = "";
  @property() accessor heading = "";
  @property() accessor description = "";

  // ── limits ────────────────────────────────────────────────
  @property({ type: Number, attribute: "max-files" }) accessor maxFiles = 10;

  /** Bytes, or a human size like "25MB". 0 or "" means no limit. */
  @property({ attribute: "max-size" }) accessor maxSize: string | number = "25MB";
  @property({ attribute: "min-size" }) accessor minSize: string | number = 0;

  /** Same vocabulary as `<input type="file" accept>`. */
  @property() accessor accept = "";

  /**
   * Per-format limits, as JSON in markup or an object in JavaScript:
   *
   *     rules='{"pdf":{"maxPages":10,"allowProtected":false}}'
   *
   * Checking pages and encryption means reading the file in the browser, so
   * it is a convenience for the person picking files — never a substitute
   * for the server enforcing the same limits.
   */
  @property({ converter: jsonAttr })
  accessor rules: FileRules = {};

  // ── destination ───────────────────────────────────────────
  @property() accessor bucket = "default";

  /** Metadata attached to every file this element uploads. */
  @property({ converter: jsonAttr })
  accessor metadata: Record<string, unknown> = {};

  /**
   * `options` sent with every file's upload request — for instance
   * `{ profile_photo: true }`, which makes the upload the account's photo.
   */
  @property({ converter: jsonAttr })
  accessor options: Record<string, unknown> = {};
  @property({ type: Boolean, attribute: "public-read" }) accessor publicRead = false;

  /** Where to go once every file has uploaded. Same-origin only. */
  @property({ attribute: "redirect-url" }) accessor redirectUrl = "";

  /** Callback forms of the two events, for frameworks that prefer props. */
  @property({ attribute: false })
  accessor onComplete:
    ((detail: { completed: UploadItem[]; failed: UploadItem[] }) => void) | null = null;

  @property({ attribute: false })
  accessor onError: ((detail: { message: string }) => void) | null = null;

  // ── state ─────────────────────────────────────────────────
  @state() private accessor items: UploadItem[] = [];
  @state() private accessor notice = "";
  @state() private accessor busy = false;
  @state() private accessor dragging = false;
  @state() private accessor editing = "";

  get msg(): SinglebaseUploadMessages {
    return resolveUploadMessages(this.messages);
  }

  /** An explicit `.client`, else the page default. */
  get resolvedClient(): UploaderClient | null {
    return this.client ?? getDefaultClient<SinglebaseClientInstance>() ?? null;
  }

  /** The staging list, for host code that wants to inspect or persist it. */
  get files(): readonly UploadItem[] {
    return this.items;
  }

  /** Overall progress across the current batch, 0–100. */
  get percent(): number {
    const active = this.items.filter((item) => item.status !== "ready");
    if (!active.length) return 0;
    return Math.round(active.reduce((sum, item) => sum + item.percent, 0) / active.length);
  }

  // ── public API ────────────────────────────────────────────
  /** Opens the file picker. */
  open(): void {
    this.renderRoot.querySelector<HTMLInputElement>("input[type=file]")?.click();
  }

  /**
   * Applies several settings at once:
   *
   *     document.getElementById("docs").config = { maxFiles: 5, metadata: { folder: "q3" } };
   *
   * Unknown keys are ignored. Reading it returns the current settings.
   */
  set config(value: Partial<UploaderConfig>) {
    const target = this as unknown as Record<string, unknown>;
    for (const key of CONFIG_KEYS) {
      if (value && key in value) target[key] = value[key];
    }
  }

  get config(): Partial<UploaderConfig> {
    const source = this as unknown as Record<string, unknown>;
    return Object.fromEntries(CONFIG_KEYS.map((key) => [key, source[key]]));
  }

  /** Drops every staged file and any notice. */
  clear(): void {
    this.items.forEach(releasePreview);
    this.items = [];
    this.notice = "";
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.items.forEach(releasePreview);
  }

  /** Uploads everything staged. Rows that already succeeded are left alone. */
  async upload(): Promise<void> {
    if (this.busy) return;
    const pending = this.items.filter((item) => item.status === "ready" || item.status === "error");
    if (!pending.length) return;

    const client = this.resolvedClient;
    if (!client) {
      this.fail(this.msg.errNoClient);
      return;
    }

    this.busy = true;
    this.notice = "";
    for (const item of pending) {
      item.status = "uploading";
      item.percent = 0;
      item.error = "";
    }
    this.items = [...this.items];

    // The SDK hands each progress and result entry back the very input object
    // it was given, so identity is all that is needed to find the row again.
    const rowOf = new Map<FileUploadInput, UploadItem>();
    const inputs = pending.map((item) => {
      const input: FileUploadInput = { file: item.file, filename: item.file.name };
      if (this.bucket) input.bucket = this.bucket;
      if (this.publicRead) input.publicRead = true;
      if (item.name !== item.file.name) input.newName = item.name;
      if (Object.keys(this.metadata ?? {}).length) input.metadata = { ...this.metadata };
      if (Object.keys(this.options ?? {}).length) input.options = { ...this.options };
      rowOf.set(input, item);
      return input;
    });

    try {
      const result = await client.files.upload(inputs, {
        onProgress: (progress: UploadProgress) => {
          const row = rowOf.get(progress.input);
          if (!row) return;
          row.percent = progress.percent;
          this.items = [...this.items];
          this.emit("singlebase-upload-progress", { file: row, percent: this.percent });
        }
      });

      for (const entry of result.completed) {
        const row = rowOf.get(entry.input);
        if (!row) continue;
        row.status = "done";
        row.percent = 100;
        row.record = entry.file;
      }
      for (const entry of result.failed) {
        const row = rowOf.get(entry.input);
        if (!row) continue;
        row.status = "error";
        row.error = entry.error.message || entry.error.code;
      }
      this.items = [...this.items];

      const completed = result.completed
        .map((entry) => rowOf.get(entry.input))
        .filter(Boolean) as UploadItem[];
      const failed = result.failed
        .map((entry) => rowOf.get(entry.input))
        .filter(Boolean) as UploadItem[];

      this.emit("singlebase-upload-complete", { completed, failed });
      this.onComplete?.({ completed, failed });

      if (failed.length) {
        this.notice = this.msg.errUpload;
      } else {
        this.redirect();
      }
    } catch (error) {
      // Initiation failed for the whole batch — nothing reached storage.
      for (const item of pending) {
        item.status = "error";
        item.error = "";
      }
      this.items = [...this.items];
      this.fail(errorMessage(error) || this.msg.errUpload);
    } finally {
      this.busy = false;
    }
  }

  // ── staging ───────────────────────────────────────────────
  /** The rule for this filename's extension, if the host set one. */
  private ruleFor(filename: string): FileRule | null {
    const extension = fileExtension(filename);
    if (!extension) return null;
    for (const [key, rule] of Object.entries(this.rules ?? {})) {
      if (key.toLowerCase().replace(/^\./, "") === extension) return rule;
    }
    return null;
  }

  private async add(list: ArrayLike<File>): Promise<void> {
    // The button view is a one-shot control: a new pick replaces whatever
    // finished last time, so a max-files="1" button can be used again.
    if (this.view === "button") {
      const finished = this.items.filter((i) => i.status === "done" || i.status === "error");
      finished.forEach(releasePreview);
      this.items = this.items.filter((i) => !finished.includes(i));
    }
    const limit = this.maxFiles > 0 ? this.maxFiles : Number.POSITIVE_INFINITY;
    const next = [...this.items];
    const before = next.length;
    const staged: UploadItem[] = [];
    let problem = "";

    for (const file of Array.from(list)) {
      if (next.length >= limit) {
        problem = fill(this.msg.errTooMany, { max: limit });
        break;
      }
      if (this.accept && !acceptsFile(this.accept, file.name, file.type)) {
        problem = fill(this.msg.errType, { name: file.name });
        continue;
      }

      // A rule's own size bounds win over the element-wide ones for its kind.
      const rule = this.ruleFor(file.name);
      const maxBytes = parseSize(rule?.maxSize ?? this.maxSize);
      const minBytes = parseSize(rule?.minSize ?? this.minSize);
      if (maxBytes && file.size > maxBytes) {
        problem = fill(this.msg.errTooLarge, { name: file.name, size: formatSize(maxBytes) });
        continue;
      }
      if (minBytes && file.size < minBytes) {
        problem = fill(this.msg.errTooSmall, { name: file.name, size: formatSize(minBytes) });
        continue;
      }
      const key = fileKey(file);
      if (next.some((item) => item.key === key)) {
        problem = fill(this.msg.errDuplicate, { name: file.name });
        continue;
      }

      const item: UploadItem = {
        key,
        file,
        name: file.name,
        // Reading bytes takes a moment, so the row appears immediately as
        // "checking" rather than the widget freezing on a picked file.
        status: this.needsInspection(rule, file.name) ? "checking" : "ready",
        percent: 0,
        error: "",
        record: null,
        pages: null,
        encrypted: null,
        preview: previewFor(file)
      };
      next.push(item);
      staged.push(item);
    }

    this.notice = problem;
    if (problem) this.emit("singlebase-upload-rejected", { message: problem });
    if (next.length === before) return;

    this.items = next;
    this.emit("singlebase-upload-selected", { files: this.items });

    await Promise.all(
      staged
        .filter((item) => item.status === "checking")
        .map((item) => this.inspect(item, this.ruleFor(item.file.name)!))
    );

    if (this.autoUpload || this.view === "button") void this.upload();
  }

  private needsInspection(rule: FileRule | null, filename: string): boolean {
    if (!rule) return false;
    if (!isInspectable(fileExtension(filename))) return false;
    return rule.maxPages !== undefined || rule.allowProtected === false;
  }

  /**
   * Reads the file and applies the rule. A fact the reader could not
   * determine is not grounds for rejection — an unreadable page count means
   * the page rule simply doesn't apply to that file.
   */
  private async inspect(item: UploadItem, rule: FileRule): Promise<void> {
    const facts = await inspectFile(item.file, fileExtension(item.file.name));
    item.pages = facts.pages;
    item.encrypted = facts.encrypted;

    let problem = "";
    if (rule.allowProtected === false && facts.encrypted === true) {
      problem = fill(this.msg.errProtected, { name: item.name });
    } else if (rule.maxPages && facts.pages !== null && facts.pages > rule.maxPages) {
      problem = fill(this.msg.errTooManyPages, {
        name: item.name,
        pages: facts.pages,
        max: rule.maxPages
      });
    }

    if (problem) {
      releasePreview(item);
      this.items = this.items.filter((staged) => staged !== item);
      this.notice = problem;
      this.emit("singlebase-upload-rejected", { message: problem });
    } else {
      item.status = "ready";
      this.items = [...this.items];
    }
  }

  /** Drops one staged file. Named for the row action, not Element.remove(). */
  private removeItem(key: string): void {
    this.items.filter((item) => item.key === key).forEach(releasePreview);
    this.items = this.items.filter((item) => item.key !== key);
    this.notice = "";
  }

  private commitRename(item: UploadItem, typed: string): void {
    item.name = renameKeepingExtension(item.file.name, typed);
    this.editing = "";
    this.items = [...this.items];
  }

  private fail(message: string): void {
    this.notice = message;
    this.emit("singlebase-upload-error", { message });
    this.onError?.({ message });
  }

  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private redirect(): void {
    if (!this.redirectUrl || typeof location === "undefined") return;
    const target = resolveRedirectTarget(this.redirectUrl, location.href, (reason) =>
      console.warn(`[singlebase-uploader] ${reason}`)
    );
    if (target) location.assign(target);
  }

  // ── events ────────────────────────────────────────────────
  private onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.add(input.files);
    // Reset, or picking the same file twice in a row fires no change event.
    input.value = "";
  }

  private onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) this.add(dropped);
  }

  private onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging = true;
  }

  private onDragLeave(): void {
    this.dragging = false;
  }

  // ── rendering ─────────────────────────────────────────────
  private get canAddMore(): boolean {
    return this.maxFiles <= 0 || this.items.length < this.maxFiles;
  }

  /** True while any staged file is still being read. */
  private get checking(): boolean {
    return this.items.some((item) => item.status === "checking");
  }

  private get pendingCount(): number {
    return this.items.filter((item) => item.status === "ready" || item.status === "error").length;
  }

  private get hint(): string {
    const kinds = acceptSummary(this.accept);
    const maxBytes = parseSize(this.maxSize);
    const size = maxBytes ? fill(this.msg.hintUpTo, { size: formatSize(maxBytes) }) : "";
    return [kinds, size].filter(Boolean).join(" · ");
  }

  private renderInput() {
    return html`<input
      class="sr-only"
      type="file"
      ?multiple=${this.maxFiles !== 1}
      accept=${this.accept || nothing}
      @change=${this.onPick}
    />`;
  }

  private renderLogo() {
    if (this.logoUrl) {
      return html`<img
        class="logo-img"
        src=${this.logoUrl}
        alt=${this.logoText || "Logo"}
        part="logo"
      />`;
    }
    if (this.logoText) return html`<div class="brand-mark" part="logo">${this.logoText}</div>`;
    return nothing;
  }

  private renderBranding() {
    if (!this.branding) return nothing;
    return html`<div class="branding" part="branding">
      <a href="https://singlebase.cloud" target="_blank" rel="noopener noreferrer"
        >${this.msg.brandingLabel}</a
      >
    </div>`;
  }

  private renderNotice() {
    if (!this.notice) return nothing;
    return html`<div class="banner" role="alert" part="error">${this.notice}</div>`;
  }

  private renderCount() {
    if (!this.items.length) return nothing;
    const template = this.items.length === 1 ? this.msg.countOne : this.msg.countMany;
    return html`<div class="count" part="count">
      ${fill(template, { n: this.items.length, max: this.maxFiles })}
    </div>`;
  }

  private renderStatus(item: UploadItem): string {
    const size = formatSize(item.file.size);
    if (item.status === "checking") return `${size} · ${this.msg.checking}`;
    if (item.status === "uploading") return `${size} · ${this.msg.uploading}`;
    if (item.status === "done") return `${size} · ${this.msg.uploaded}`;
    if (item.status === "error") {
      return `${size} · ${item.error || this.msg.failedLabel}`;
    }
    // A page count is only shown once it has actually been read.
    const pages = item.pages ? ` · ${fill(this.msg.pagesLabel, { n: item.pages })}` : "";
    return size + pages;
  }

  private renderRow(item: UploadItem) {
    const editable = this.allowRename && item.status === "ready";
    const busyRow = item.status === "uploading" || item.status === "done";
    return html`<div class="row" part="file">
      <div class="chip" part="file-type">
        ${
          item.preview
            ? html`<img class="thumb" src=${item.preview} alt="" part="preview" />`
            : extensionOf(item.name) || "FILE"
        }
      </div>
      <div class="meta">
        ${
          this.editing === item.key
            ? html`<input
                class="name-input"
                .value=${item.name}
                autofocus
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === "Enter") {
                    this.commitRename(item, (event.target as HTMLInputElement).value);
                  } else if (event.key === "Escape") {
                    this.editing = "";
                  }
                }}
                @blur=${(event: FocusEvent) =>
                  this.commitRename(item, (event.target as HTMLInputElement).value)}
              />`
            : editable
              ? html`<button
                  class="name"
                  title=${this.msg.rename}
                  @click=${() => {
                    this.editing = item.key;
                  }}
                >
                  ${item.name}
                </button>`
              : html`<div class="name">${item.name}</div>`
        }
        <div class="sz" data-state=${item.status}>${this.renderStatus(item)}</div>
        ${
          item.status === "uploading"
            ? html`<div class="bar" part="progress">
                <div class="bar-fill" style="width:${item.percent}%"></div>
              </div>`
            : nothing
        }
      </div>
      <div class="row-act">
        ${
          item.status === "error"
            ? html`<button class="link-sm" @click=${() => void this.upload()}>
                ${this.msg.retry}
              </button>`
            : nothing
        }
        ${
          item.status === "uploading" || item.status === "done"
            ? nothing
            : html`<button class="link-sm" @click=${() => this.removeItem(item.key)}>
                ${this.msg.remove}
              </button>`
        }
      </div>
    </div>`;
  }

  private renderRows() {
    if (!this.items.length) return nothing;
    return html`<div class="rows" part="files">
      ${this.items.map((item) => this.renderRow(item))}
    </div>`;
  }

  private renderDropzone() {
    return html`<div class="drop" part="dropzone" data-drag=${String(this.dragging)}>
      <div class="arrow" aria-hidden="true">↑</div>
      <div class="drop-title">${this.msg.dropTitle}</div>
      <button class="link" @click=${this.open}>${this.msg.dropSub}</button>
      ${this.hint ? html`<div class="hint">${this.hint}</div>` : nothing}
    </div>`;
  }

  private renderUploadCta() {
    const n = this.pendingCount;
    // Kept on screen while busy: a primary button that vanishes mid-upload
    // makes the card jump just as the user is watching it.
    if (this.autoUpload || (!n && !this.busy)) return nothing;
    const template = n === 1 ? this.msg.uploadCtaOne : this.msg.uploadCtaMany;
    return html`<button
      class="primary wide"
      part="submit"
      ?disabled=${this.busy || this.checking}
      @click=${() => void this.upload()}
    >
      ${this.busy ? this.msg.uploading : fill(template, { n })}
    </button>`;
  }

  /**
   * The whole card is the drop surface. Once files are staged the big zone is
   * replaced by the "add more" control, and a drop should still land.
   */
  private renderFull() {
    const showDrop = this.dropzone && !this.items.length && this.canAddMore;
    return html`<div
      class="card"
      part="card"
      @dragover=${this.onDragOver}
      @dragleave=${this.onDragLeave}
      @drop=${this.onDrop}
    >
      ${
        this.logoUrl || this.logoText || this.heading || this.description
          ? html`<div class="head-block">
              ${this.renderLogo()}
              ${this.heading ? html`<div class="title">${this.heading}</div>` : nothing}
              ${this.description ? html`<div class="sub">${this.description}</div>` : nothing}
            </div>`
          : nothing
      }
      ${this.renderCount()} ${this.renderNotice()} ${this.renderRows()}
      ${showDrop ? this.renderDropzone() : nothing}
      ${
        !showDrop && this.canAddMore
          ? html`<button class="add-more" @click=${this.open}>${this.msg.addMore}</button>`
          : nothing
      }
      ${this.renderUploadCta()} ${this.renderBranding()}
    </div>`;
  }

  private renderCompact() {
    return html`<div
      class="card"
      part="card"
      @dragover=${this.onDragOver}
      @dragleave=${this.onDragLeave}
      @drop=${this.onDrop}
    >
      <div class="between">
        <span class="sec-title">${this.heading || this.msg.attachments}</span>
        <span class="count">${this.items.length} / ${this.maxFiles}</span>
      </div>
      ${
        this.dropzone
          ? html`<div class="strip" part="dropzone" data-drag=${String(this.dragging)}>
              <span class="strip-label">${this.msg.dropOrChoose}</span>
              <button class="secondary" ?disabled=${!this.canAddMore} @click=${this.open}>
                ${this.msg.chooseFiles}
              </button>
            </div>`
          : html`<button class="secondary" ?disabled=${!this.canAddMore} @click=${this.open}>
              ${this.msg.chooseFiles}
            </button>`
      }
      ${this.hint ? html`<div class="hint">${this.hint}</div>` : nothing} ${this.renderNotice()}
      ${this.renderRows()} ${this.renderUploadCta()} ${this.renderBranding()}
    </div>`;
  }

  private renderButton() {
    const active = this.items[this.items.length - 1];
    return html`<div class="button-view">
      <button class="primary" ?disabled=${this.busy || !this.canAddMore} @click=${this.open}>
        ${this.busy ? this.msg.uploading : this.msg.chooseFile}
      </button>
      ${
        active && active.status !== "ready"
          ? html`<div class="sz" data-state=${active.status}>${this.renderStatus(active)}</div>`
          : nothing
      }
      ${this.renderNotice()}
    </div>`;
  }

  override render() {
    return html`${this.renderInput()}${
      this.view === "button"
        ? this.renderButton()
        : this.view === "compact"
          ? this.renderCompact()
          : this.renderFull()
    }`;
  }
}

/**
 * A local thumbnail for images. The object URL points at the bytes already in
 * memory — nothing is uploaded to draw it — and it is revoked when the row
 * goes away so a long session doesn't leak blobs.
 */
function previewFor(file: File): string {
  if (!file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") return "";
  return URL.createObjectURL(file);
}

function releasePreview(item: UploadItem): void {
  if (item.preview) URL.revokeObjectURL(item.preview);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

declare global {
  interface HTMLElementTagNameMap {
    "singlebase-uploader": SinglebaseUploader;
  }
}
