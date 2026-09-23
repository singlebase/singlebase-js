import { SinglebaseError, type RpcDispatcher } from "@singlebase/core";

/**
 * Direct-to-storage file uploads.
 *
 * The binary never passes through the Singlebase API. The API hands out a
 * pre-signed destination (`files.initiate_upload`), the browser POSTs the bytes
 * straight to it, and the permanent file record is created only once
 * `files.complete_upload` has verified the stored object.
 *
 * ```
 * files.initiate_upload  →  POST to storage  →  files.complete_upload
 *                                           ↘  files.fail_upload
 * ```
 */

/** Items the API accepts in one `files.*` batch. Larger inputs are chunked. */
export const FILES_BATCH_SIZE = 10;

/** Anything the runtime can put in a `FormData` body: File, Blob, Buffer, bytes. */
export type UploadBody = unknown;

export interface FileUploadInput {
  /** The binary. SDK-only — it is never part of an API payload. */
  file: UploadBody;
  /** Original filename with extension. Defaults to `file.name` for a File. */
  filename?: string;
  contentType?: string;
  /** Defaults to `"default"` server-side. */
  bucket?: string;
  /** Saved filename, when it should differ from `filename`. */
  newName?: string;
  publicRead?: boolean;
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

/** A `File`/`Blob` on its own is shorthand for `{ file }`. */
export type FileUploadSource = FileUploadInput | Blob;

export interface InitiatedUpload {
  id: string;
  upload: { url: string; fields: Record<string, string> };
  /**
   * Authorization for completing or failing this upload. Short-lived and
   * sensitive: never send it to the storage provider, and don't expose it
   * beyond the code that will complete the upload.
   */
  uploadToken: string;
}

/** The serializable handle that `completeUpload` needs, and nothing more. */
export interface UploadCompletion {
  id: string;
  uploadToken: string;
}

export interface UploadError {
  code: string;
  message: string;
}

export interface UploadFailure extends UploadCompletion {
  /** A caught error, or an explicit `{ code, message }`. Normalized either way. */
  error: unknown;
}

export interface UploadProgress {
  /** The input this progress belongs to — the same object you passed in. */
  input: FileUploadInput;
  id: string;
  loaded: number;
  /** 0 when the runtime can't tell how big the body is. */
  total: number;
  /** 0–100, or 0 while the total is unknown. */
  percent: number;
}

export interface UploadOptions {
  signal?: AbortSignal;
  /** Bucket for inputs that don't name one. */
  bucket?: string;
  /**
   * Called as bytes leave the browser. Supplying it switches the storage POST
   * to `XMLHttpRequest`, the only API that reports upload progress — `fetch`
   * has no equivalent. Everything else about the request is identical, and
   * outside a browser the fetch path is used regardless.
   */
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadResult<TFile = any> {
  completed: { input: FileUploadInput; id: string; file: TFile }[];
  failed: { input: FileUploadInput; id: string | null; error: UploadError }[];
}

export interface FilesUploadApi {
  initiateUpload(
    files: ArrayLike<FileUploadSource>,
    options?: UploadOptions
  ): Promise<InitiatedUpload[]>;
  uploadToRemote(
    file: FileUploadSource,
    initiated: InitiatedUpload,
    options?: UploadOptions
  ): Promise<UploadCompletion>;
  completeUpload<TFile = any>(
    completions: UploadCompletion[],
    options?: UploadOptions
  ): Promise<TFile[]>;
  failUpload(failures: UploadFailure[], options?: UploadOptions): Promise<void>;
  /** A `FileList` from an `<input type="file">` is accepted directly. */
  upload<TFile = any>(
    files: ArrayLike<FileUploadSource>,
    options?: UploadOptions
  ): Promise<UploadResult<TFile>>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function normalizeInput(source: FileUploadSource): FileUploadInput {
  return isBlob(source) ? { file: source } : source;
}

function filenameOf(input: FileUploadInput): string {
  const name = input.filename ?? (input.file as File | undefined)?.name;
  if (!name) {
    throw new SinglebaseError({
      type: "INVALID_PAYLOAD",
      status: 0,
      message: "MISSING_FILENAME"
    });
  }
  return name;
}

/** The API-side descriptor. The binary is deliberately absent. */
function initiatePayloadFor(input: FileUploadInput): Record<string, unknown> {
  const file = input.file as Blob | undefined;
  const entry: Record<string, unknown> = { filename: filenameOf(input) };
  const contentType = input.contentType ?? (file && isBlob(file) ? file.type : "");
  if (contentType) entry.content_type = contentType;
  if (input.bucket) entry.bucket = input.bucket;
  if (input.newName) entry.new_name = input.newName;
  if (input.publicRead !== undefined) entry.public_read = input.publicRead;
  if (input.metadata) entry.metadata = input.metadata;
  if (input.options) entry.options = input.options;
  return entry;
}

function badResponse(message: string): SinglebaseError {
  return new SinglebaseError({ type: "INVALID_RESPONSE", status: 0, message });
}

function readInitiated(raw: unknown, expected: number): InitiatedUpload[] {
  if (!Array.isArray(raw) || raw.length !== expected) {
    throw badResponse("INVALID_UPLOAD_RESPONSE");
  }
  return raw.map((item: any) => {
    const url = item?.upload?.url;
    if (!item?.id || !item?.upload_token || typeof url !== "string") {
      throw badResponse("INVALID_UPLOAD_RESPONSE");
    }
    return {
      id: String(item.id),
      upload: { url, fields: item.upload.fields ?? {} },
      uploadToken: String(item.upload_token)
    };
  });
}

/**
 * Reduces anything thrown to a code and a message. Nothing else travels: an
 * error object sent to `fail_upload` must not carry signatures, headers, or
 * tokens picked up along the way.
 */
export function normalizeUploadError(error: unknown): UploadError {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const { code, message } = error as UploadError;
    return { code: String(code), message: String(message).slice(0, 500) };
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return { code: "UPLOAD_FAILED", message: message.slice(0, 500) };
}

async function postWithFetch(
  fetchImpl: typeof fetch,
  url: string,
  form: FormData,
  signal?: AbortSignal
): Promise<number> {
  const res = await fetchImpl(url, { method: "POST", body: form, signal });
  return res.status ?? (res.ok ? 200 : 500);
}

/**
 * The same POST over XMLHttpRequest, which is the only browser API that
 * reports how much of a request body has been sent. Used only when a caller
 * asked for progress.
 */
function postWithProgress(
  url: string,
  form: FormData,
  report: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      report(event.loaded, event.lengthComputable ? event.total : 0);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("NETWORK_ERROR"));
    xhr.onabort = () => reject(new Error("ABORTED"));
    if (signal) {
      if (signal.aborted) {
        reject(new Error("ABORTED"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

/** Binds the upload flow to one dispatcher. */
export function createFilesUploadApi(dispatcher: RpcDispatcher): FilesUploadApi {
  const call = <TResult>(
    operation: string,
    files: unknown[],
    options?: UploadOptions
  ): Promise<TResult> =>
    dispatcher.dispatch<TResult>({ operation, payload: { files } }, { signal: options?.signal });

  async function initiateUpload(
    sources: ArrayLike<FileUploadSource>,
    options?: UploadOptions
  ): Promise<InitiatedUpload[]> {
    const inputs = Array.from(sources, normalizeInput);
    const out: InitiatedUpload[] = [];
    // Sequential per chunk: the API caps a batch at FILES_BATCH_SIZE, and
    // pushing in order is what keeps the result aligned with the input.
    for (const group of chunk(inputs, FILES_BATCH_SIZE)) {
      const payload = group.map((input) =>
        initiatePayloadFor(options?.bucket ? { bucket: options.bucket, ...input } : input)
      );
      const data = await call<unknown>("files.initiate_upload", payload, options);
      out.push(...readInitiated(data, group.length));
    }
    return out;
  }

  async function uploadToRemote(
    file: FileUploadSource,
    initiated: InitiatedUpload,
    options?: UploadOptions
  ): Promise<UploadCompletion> {
    const input = normalizeInput(file);
    const form = new FormData();
    for (const [key, value] of Object.entries(initiated.upload.fields ?? {})) {
      form.append(key, value as string);
    }
    const body = input.file;
    const blob = (isBlob(body) ? body : new Blob([body as any])) as Blob;
    const size = blob.size ?? 0;
    form.append("file", blob, filenameOf(input));

    const notify = options?.onProgress;
    const report = notify
      ? (loaded: number, total: number) =>
          notify({
            input,
            id: initiated.id,
            loaded,
            total,
            percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
          })
      : undefined;

    // No API key and no bearer: this request goes to the storage provider,
    // not to Singlebase. Content-Type is left alone so the runtime sets the
    // multipart boundary.
    let status: number;
    try {
      status =
        report && typeof XMLHttpRequest !== "undefined"
          ? await postWithProgress(initiated.upload.url, form, report, options?.signal)
          : await postWithFetch(
              dispatcher.options.fetch ?? globalThis.fetch,
              initiated.upload.url,
              form,
              options?.signal
            );
    } catch (cause) {
      throw new SinglebaseError(
        { type: "UPLOAD_FAILED", status: 0, message: "UPLOAD_FAILED" },
        cause
      );
    }
    if (status >= 400) {
      throw new SinglebaseError({ type: "UPLOAD_FAILED", status, message: "UPLOAD_FAILED" });
    }

    report?.(size, size);
    return { id: initiated.id, uploadToken: initiated.uploadToken };
  }

  async function completeUpload<TFile = any>(
    completions: UploadCompletion[],
    options?: UploadOptions
  ): Promise<TFile[]> {
    const out: TFile[] = [];
    for (const group of chunk(completions, FILES_BATCH_SIZE)) {
      const data = await call<unknown>(
        "files.complete_upload",
        group.map(({ id, uploadToken }) => ({ id, upload_token: uploadToken })),
        options
      );
      if (!Array.isArray(data)) throw badResponse("INVALID_UPLOAD_RESPONSE");
      out.push(...(data as TFile[]));
    }
    return out;
  }

  async function failUpload(failures: UploadFailure[], options?: UploadOptions): Promise<void> {
    for (const group of chunk(failures, FILES_BATCH_SIZE)) {
      await call<unknown>(
        "files.fail_upload",
        group.map(({ id, uploadToken, error }) => ({
          id,
          upload_token: uploadToken,
          error: normalizeUploadError(error)
        })),
        options
      );
    }
  }

  async function upload<TFile = any>(
    sources: ArrayLike<FileUploadSource>,
    options?: UploadOptions
  ): Promise<UploadResult<TFile>> {
    const inputs = Array.from(sources, normalizeInput);
    const result: UploadResult<TFile> = { completed: [], failed: [] };

    for (const group of chunk(inputs, FILES_BATCH_SIZE)) {
      const initiated = await initiateUpload(group, options);

      const done: { input: FileUploadInput; completion: UploadCompletion }[] = [];
      const bad: { input: FileUploadInput; id: string; uploadToken: string; error: unknown }[] = [];

      await Promise.all(
        group.map(async (input, i) => {
          const item = initiated[i];
          try {
            done.push({ input, completion: await uploadToRemote(input, item, options) });
          } catch (error) {
            bad.push({ input, id: item.id, uploadToken: item.uploadToken, error });
          }
        })
      );

      // One bad file must not hold back the good ones, so the two outcomes are
      // reported independently.
      if (done.length) {
        try {
          const records = await completeUpload<TFile>(
            done.map((d) => d.completion),
            options
          );
          done.forEach((d, i) => {
            result.completed.push({ input: d.input, id: d.completion.id, file: records[i] });
          });
        } catch (error) {
          const normalized = normalizeUploadError(error);
          done.forEach((d) => {
            result.failed.push({ input: d.input, id: d.completion.id, error: normalized });
          });
        }
      }

      if (bad.length) {
        try {
          await failUpload(
            bad.map((b) => ({ id: b.id, uploadToken: b.uploadToken, error: b.error })),
            options
          );
        } catch {
          // Reporting the failure is best-effort; the caller still gets it back.
        }
        bad.forEach((b) => {
          result.failed.push({ input: b.input, id: b.id, error: normalizeUploadError(b.error) });
        });
      }
    }

    // Promise.all resolves in order, but the per-file pushes above do not, so
    // the combined result is restored to the caller's input order.
    const order = new Map(inputs.map((input, i) => [input, i]));
    const rank = (e: { input: FileUploadInput }) => order.get(e.input) ?? 0;
    result.completed.sort((a, b) => rank(a) - rank(b));
    result.failed.sort((a, b) => rank(a) - rank(b));
    return result;
  }

  return { initiateUpload, uploadToRemote, completeUpload, failUpload, upload };
}
