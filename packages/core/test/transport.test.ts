import { jest } from "@jest/globals";
import { request, assertSecureBaseUrl, endpointFor, DEFAULT_BASE_URL } from "../src/transport.js";
import { SinglebaseAuthError } from "../src/errors.js";
import type { AuthClientOptions } from "../src/types.js";

function makeFetch(response: unknown, ok = true) {
  return jest.fn(async () => ({
    ok,
    json: async () => response
  })) as unknown as typeof fetch;
}

const baseOptions: AuthClientOptions = {
  baseUrl: "https://api.example.com",
  urlAccessKey: "abc123",
  apiKey: "wk_test"
};

describe("assertSecureBaseUrl", () => {
  it("allows https", () => {
    expect(() => assertSecureBaseUrl("https://api.example.com")).not.toThrow();
  });

  it("allows http on localhost", () => {
    expect(() => assertSecureBaseUrl("http://localhost:8080")).not.toThrow();
  });

  it("rejects http on a non-local host", () => {
    expect(() => assertSecureBaseUrl("http://api.example.com")).toThrow();
  });
});

describe("request", () => {
  it("builds the RPC envelope and required headers", async () => {
    const fetchMock = makeFetch({ data: { ok: true }, meta: {}, exec_time: 0.01 });
    await request(
      { ...baseOptions, fetch: fetchMock },
      "auth.signin",
      { email: "a@b.com" },
      { token: "id-token-123" }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.example.com/abc123");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-API-Key"]).toBe("wk_test");
    expect(init.headers.Authorization).toBe("Bearer id-token-123");

    const body = JSON.parse(init.body);
    expect(body).toEqual({ operation: "auth.signin", payload: { email: "a@b.com" } });
  });

  it("omits Authorization when no token is given", async () => {
    const fetchMock = makeFetch({ data: {}, meta: {}, exec_time: 0.01 });
    await request({ ...baseOptions, fetch: fetchMock }, "auth.settings", {});
    const [, init] = (fetchMock as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("returns response.data on success", async () => {
    const fetchMock = makeFetch({ data: { hello: "world" }, meta: {}, exec_time: 0.01 });
    const data = await request({ ...baseOptions, fetch: fetchMock }, "auth.settings", {});
    expect(data).toEqual({ hello: "world" });
  });

  it("throws SinglebaseAuthError on an error response", async () => {
    const fetchMock = makeFetch({
      error: { type: "UNAUTHORIZED_ERROR", status: 401, message: "INVALID_CREDENTIALS" },
      meta: {},
      exec_time: 0.01
    });
    await expect(request({ ...baseOptions, fetch: fetchMock }, "auth.signin", {})).rejects.toThrow(
      SinglebaseAuthError
    );
    try {
      await request({ ...baseOptions, fetch: fetchMock }, "auth.signin", {});
    } catch (error) {
      expect((error as SinglebaseAuthError).code).toBe("INVALID_CREDENTIALS");
      expect((error as SinglebaseAuthError).status).toBe(401);
    }
  });

  it("normalizes a network failure into SinglebaseAuthError", async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(
      request({ ...baseOptions, fetch: fetchMock }, "auth.settings", {})
    ).rejects.toThrow(SinglebaseAuthError);
  });
});

describe("envelope shape", () => {
  it("sends operation and payload, and nothing else, when there are no options", async () => {
    const fetchMock = jest.fn(async (_url: unknown, init: any) => ({
      ok: true,
      json: async () => ({ data: {}, meta: {}, exec_time: 0 })
    })) as unknown as typeof fetch;

    await request(
      { baseUrl: "https://api.example.com", urlAccessKey: "k", apiKey: "wk_x", fetch: fetchMock },
      "data.query",
      { limit: 5 }
    );

    const body = JSON.parse((fetchMock as unknown as jest.Mock).mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["operation", "payload"]);
  });

  it("carries options as the third and only other envelope key", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: {}, meta: {}, exec_time: 0 })
    })) as unknown as typeof fetch;

    await request(
      { baseUrl: "https://api.example.com", urlAccessKey: "k", apiKey: "wk_x", fetch: fetchMock },
      "data.query",
      { limit: 5 },
      { options: { collection: "notes" } }
    );

    const body = JSON.parse((fetchMock as unknown as jest.Mock).mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["operation", "options", "payload"]);
    expect(body.options).toEqual({ collection: "notes" });
  });
});

describe("endpoint", () => {
  const base = { apiKey: "wk_x" };

  it("defaults to https://v1.singlebase.io/api", () => {
    expect(endpointFor(base)).toBe("https://v1.singlebase.io/api");
    expect(DEFAULT_BASE_URL).toBe("https://v1.singlebase.io/api");
  });

  it("appends the access key when there is one", () => {
    expect(endpointFor({ ...base, urlAccessKey: "proj" })).toBe(
      "https://v1.singlebase.io/api/proj"
    );
  });

  it("treats an empty access key as none", () => {
    expect(endpointFor({ ...base, urlAccessKey: "" })).toBe("https://v1.singlebase.io/api");
    expect(endpointFor({ ...base, urlAccessKey: "  " })).toBe("https://v1.singlebase.io/api");
  });

  it("uses a custom base URL, ignoring a trailing slash", () => {
    expect(
      endpointFor({ ...base, baseUrl: "https://api.example.com/api/", urlAccessKey: "k" })
    ).toBe("https://api.example.com/api/k");
  });

  it("rejects an explicitly null or empty base URL", () => {
    expect(() => endpointFor({ ...base, baseUrl: null as unknown as string })).toThrow(
      /cannot be null or empty/
    );
    expect(() => endpointFor({ ...base, baseUrl: "" })).toThrow(/cannot be null or empty/);
  });

  it("still refuses plain http outside localhost", () => {
    expect(() => endpointFor({ ...base, baseUrl: "http://api.example.com" })).toThrow(/HTTPS/);
    expect(endpointFor({ ...base, baseUrl: "http://localhost:8000/api" })).toBe(
      "http://localhost:8000/api"
    );
  });
});

describe("API key", () => {
  const capture = () => {
    const seen: Record<string, string>[] = [];
    const fetchMock = (async (_url: string, init: any) => {
      seen.push(init.headers);
      return { ok: true, json: async () => ({ data: {}, meta: {}, exec_time: 0 }) };
    }) as unknown as typeof fetch;
    return { seen, fetchMock };
  };

  it("sends X-API-Key when one is set", async () => {
    const { seen, fetchMock } = capture();
    await request({ apiKey: "wk_x", fetch: fetchMock }, "data.query", {});
    expect(seen[0]["X-API-Key"]).toBe("wk_x");
  });

  it("is optional: no key, no header", async () => {
    const { seen, fetchMock } = capture();
    await request({ fetch: fetchMock }, "data.query", {});
    expect("X-API-Key" in seen[0]).toBe(false);
  });
});
