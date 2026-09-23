import { jest } from "@jest/globals";
import { SinglebaseClient } from "../src/client.js";
import type { SinglebaseClientOptions } from "../src/client.js";

const STORAGE = "https://storage.example.com/bucket";

interface ApiCall {
  operation: string;
  payload: any;
}

interface Harness {
  api: ApiCall[];
  storage: { url: string; form: FormData; headers: unknown }[];
  fetch: typeof fetch;
}

/**
 * One fetch stub standing in for both hops: the Singlebase API (JSON) and the
 * storage provider (multipart). Which one it is, is decided by the URL.
 */
function harness(
  opts: {
    onApi?: (call: ApiCall) => unknown;
    storageStatus?: (form: FormData, n: number) => number;
  } = {}
): Harness {
  const api: ApiCall[] = [];
  const storage: Harness["storage"] = [];
  let uploads = 0;

  const fetchImpl = jest.fn(async (url: any, init: any) => {
    if (String(url).startsWith(STORAGE)) {
      const status = opts.storageStatus?.(init.body, uploads++) ?? 204;
      storage.push({ url: String(url), form: init.body, headers: init.headers });
      return { ok: status < 400, status, json: async () => ({}) };
    }
    const body = JSON.parse(init.body);
    const call = { operation: body.operation, payload: body.payload };
    api.push(call);
    const data = opts.onApi ? opts.onApi(call) : defaultApi(call);
    if (data && typeof data === "object" && "error" in (data as any)) {
      return { ok: false, json: async () => data };
    }
    return { ok: true, json: async () => ({ data, meta: {}, exec_time: 0.001 }) };
  });

  return { api, storage, fetch: fetchImpl as unknown as typeof fetch };
}

let seq = 0;
function defaultApi(call: ApiCall): unknown {
  const files = call.payload.files as any[];
  if (call.operation === "files.initiate_upload") {
    return files.map((f) => {
      const id = `id${++seq}`;
      return {
        id,
        upload: { url: `${STORAGE}/${id}`, fields: { key: `k/${f.filename}`, policy: "p" } },
        upload_token: `tok-${id}`
      };
    });
  }
  if (call.operation === "files.complete_upload") {
    return files.map((f) => ({ id: f.id, url: `${STORAGE}/${f.id}`, status: "completed" }));
  }
  return [];
}

function client(fetchImpl: typeof fetch) {
  const options: SinglebaseClientOptions = {
    baseUrl: `https://api-${Math.random().toString(36).slice(2)}.example.com`,
    urlAccessKey: "abc123",
    apiKey: "wk_test",
    fetch: fetchImpl,
    auth: { autoRefresh: false }
  };
  return SinglebaseClient(options);
}

const blob = (text = "hello") => new Blob([text], { type: "text/plain" });
const input = (name: string) => ({ file: blob(name), filename: name });

describe("files upload", () => {
  beforeEach(() => {
    seq = 0;
  });

  it("uploads one file: initiate → storage → complete", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const result = await sbc.files.upload([input("report.pdf")]);

    expect(h.api.map((c) => c.operation)).toEqual([
      "files.initiate_upload",
      "files.complete_upload"
    ]);
    expect(h.api[0].payload.files[0]).toEqual({
      filename: "report.pdf",
      content_type: "text/plain"
    });
    // The binary is never part of an API payload.
    expect(JSON.stringify(h.api[0].payload)).not.toContain("Blob");

    expect(h.storage).toHaveLength(1);
    const form = h.storage[0].form;
    expect(form.get("key")).toBe("k/report.pdf");
    expect(form.get("policy")).toBe("p");
    expect(form.get("file")).toBeInstanceOf(Blob);
    // The multipart Content-Type must be left to the runtime, for the boundary.
    expect(h.storage[0].headers).toBeUndefined();
    // The upload token is application authorization; storage never sees it.
    expect(JSON.stringify([...form.keys()])).not.toContain("token");

    expect(h.api[1].payload.files).toEqual([{ id: "id1", upload_token: "tok-id1" }]);
    expect(result.failed).toEqual([]);
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].id).toBe("id1");
    expect(result.completed[0].file).toMatchObject({ status: "completed" });
  });

  it("carries every descriptor field through, in snake_case", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    await sbc.files.initiateUpload([
      {
        file: blob(),
        filename: "a.pdf",
        contentType: "application/pdf",
        bucket: "docs",
        newName: "quarterly-report",
        publicRead: true,
        metadata: { category: "reports" },
        options: { x: 1 }
      }
    ]);

    expect(h.api[0].payload.files[0]).toEqual({
      filename: "a.pdf",
      content_type: "application/pdf",
      bucket: "docs",
      new_name: "quarterly-report",
      public_read: true,
      metadata: { category: "reports" },
      options: { x: 1 }
    });
  });

  it("uploads multiple files in one batch", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const result = await sbc.files.upload([input("a.txt"), input("b.txt"), input("c.txt")]);

    expect(h.api).toHaveLength(2);
    expect(h.api[0].payload.files).toHaveLength(3);
    expect(h.storage).toHaveLength(3);
    expect(result.completed.map((c) => c.id)).toEqual(["id1", "id2", "id3"]);
    expect(result.failed).toEqual([]);
  });

  it("completes the good files even when one storage upload fails", async () => {
    const h = harness({ storageStatus: (_form, n) => (n === 1 ? 403 : 204) });
    const sbc = client(h.fetch);

    const result = await sbc.files.upload([input("a.txt"), input("b.txt"), input("c.txt")]);

    expect(result.completed).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error.code).toBe("UPLOAD_FAILED");

    const ops = h.api.map((c) => c.operation);
    expect(ops).toContain("files.complete_upload");
    expect(ops).toContain("files.fail_upload");

    const completed = h.api.find((c) => c.operation === "files.complete_upload")!;
    expect(completed.payload.files).toHaveLength(2);

    const failed = h.api.find((c) => c.operation === "files.fail_upload")!;
    expect(failed.payload.files).toHaveLength(1);
    expect(failed.payload.files[0]).toMatchObject({
      upload_token: expect.any(String),
      error: { code: "UPLOAD_FAILED" }
    });
  });

  it("chunks more than 10 files and preserves input order", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const names = Array.from({ length: 23 }, (_, i) => `f${i}.txt`);
    const result = await sbc.files.upload(names.map(input));

    const initiates = h.api.filter((c) => c.operation === "files.initiate_upload");
    expect(initiates.map((c) => c.payload.files.length)).toEqual([10, 10, 3]);
    expect(result.completed).toHaveLength(23);
    expect(result.completed.map((c) => c.input.filename)).toEqual(names);
  });

  it("accepts an array-like, as a FileList from an <input> is", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const list = { 0: input("a.txt"), 1: input("b.txt"), length: 2 } as any;
    const result = await sbc.files.upload(list);

    expect(result.completed).toHaveLength(2);
  });

  it("reports progress, falling back to fetch where XMLHttpRequest is absent", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const seen: number[] = [];
    await sbc.files.upload([input("a.txt")], {
      onProgress: (p) => {
        seen.push(p.percent);
        expect(p.input.filename).toBe("a.txt");
        expect(p.id).toBe("id1");
      }
    });

    // No XHR in Node, so the only report is the completion one.
    expect(seen[seen.length - 1]).toBe(100);
    expect(h.storage).toHaveLength(1);
  });

  it("supports completing later, from serializable data alone", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const [initiated] = await sbc.files.initiateUpload([input("later.txt")]);
    const completion = await sbc.files.uploadToRemote(input("later.txt"), initiated);

    // Round-trips through storage: no File, no url, no fields, no payload.
    const stored = JSON.parse(JSON.stringify(completion));
    expect(stored).toEqual({ id: "id1", uploadToken: "tok-id1" });

    const records = await sbc.files.completeUpload([stored]);
    expect(records).toHaveLength(1);
    expect(h.api[1].payload.files).toEqual([{ id: "id1", upload_token: "tok-id1" }]);
  });

  it("completion is idempotent from the SDK's side", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    const one = await sbc.files.completeUpload([{ id: "id9", uploadToken: "tok" }]);
    const two = await sbc.files.completeUpload([{ id: "id9", uploadToken: "tok" }]);
    expect(two).toEqual(one);
  });

  it("failUpload normalizes the error and never carries credentials", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    await sbc.files.failUpload([
      { id: "id1", uploadToken: "tok-id1", error: new Error("Connection lost") }
    ]);

    expect(h.api[0].operation).toBe("files.fail_upload");
    expect(h.api[0].payload.files[0]).toEqual({
      id: "id1",
      upload_token: "tok-id1",
      error: { code: "UPLOAD_FAILED", message: "Connection lost" }
    });
  });

  it("keeps an explicit { code, message } error as given", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    await sbc.files.failUpload([
      { id: "id1", uploadToken: "t", error: { code: "ABORTED", message: "user cancelled" } }
    ]);

    expect(h.api[0].payload.files[0].error).toEqual({
      code: "ABORTED",
      message: "user cancelled"
    });
  });

  it("rejects a malformed initiation response", async () => {
    const short = harness({
      onApi: (c) => (c.operation === "files.initiate_upload" ? [] : defaultApi(c))
    });
    await expect(client(short.fetch).files.initiateUpload([input("a.txt")])).rejects.toMatchObject({
      code: "INVALID_UPLOAD_RESPONSE"
    });

    const missing = harness({
      onApi: (c) => (c.operation === "files.initiate_upload" ? [{ id: "x" }] : defaultApi(c))
    });
    await expect(
      client(missing.fetch).files.initiateUpload([input("a.txt")])
    ).rejects.toMatchObject({ code: "INVALID_UPLOAD_RESPONSE" });
  });

  it("treats any non-successful storage response as a failure", async () => {
    const h = harness({ storageStatus: () => 500 });
    const sbc = client(h.fetch);

    const [initiated] = await sbc.files.initiateUpload([input("a.txt")]);
    await expect(sbc.files.uploadToRemote(input("a.txt"), initiated)).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      status: 500
    });
  });

  it("reports every file as failed when the API completion call fails", async () => {
    const h = harness({
      onApi: (c) =>
        c.operation === "files.complete_upload"
          ? { error: { type: "SERVER_ERROR", status: 500, message: "VERIFICATION_FAILED" } }
          : defaultApi(c)
    });
    const sbc = client(h.fetch);

    const result = await sbc.files.upload([input("a.txt"), input("b.txt")]);

    expect(result.completed).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].error.code).toBe("VERIFICATION_FAILED");
    expect(result.failed.map((f) => f.input.filename)).toEqual(["a.txt", "b.txt"]);
  });

  it("accepts a bare Blob and still reaches the other files.* operations", async () => {
    const h = harness();
    const sbc = client(h.fetch);

    await sbc.files.initiateUpload([Object.assign(blob(), {})] as any).catch(() => {});
    // A Blob with no name has no filename to send.
    expect(h.api).toHaveLength(0);

    await sbc.files.list({ bucket: "default" });
    expect(h.api[0].operation).toBe("files.list");
  });
});
