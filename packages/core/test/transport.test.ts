import { jest } from "@jest/globals";
import { request, assertSecureBaseUrl } from "../src/transport.js";
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
    expect(url).toBe("https://api.example.com/api/abc123");
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
