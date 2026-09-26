import { jest } from "@jest/globals";
import { SinglebaseClient } from "../src/client.js";
import type { SinglebaseClientOptions } from "../src/client.js";

function makeFetch(handler: (body: any) => unknown) {
  return jest.fn(async (_url: unknown, init: any) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ data: handler(body), meta: {}, exec_time: 0.001 })
    };
  }) as unknown as typeof fetch;
}

const OPTIONS = (fetchImpl: typeof fetch): SinglebaseClientOptions => ({
  baseUrl: `https://api-${Math.random().toString(36).slice(2)}.example.com`,
  urlAccessKey: "abc123",
  apiKey: "wk_test",
  fetch: fetchImpl,
  auth: { autoRefresh: false }
});

describe("SinglebaseClient", () => {
  it("maps namespace methods to <namespace>.<method> operations", async () => {
    const seen: any[] = [];
    const fetchMock = makeFetch((body) => {
      seen.push(body);
      return { ok: true };
    });
    const sbc = SinglebaseClient(OPTIONS(fetchMock));

    await sbc.data.insert({ name: "Ada" }, { options: { collection: "users" } });
    await sbc.llm.summarize({ text: "hello" });
    await sbc.files.list({ id: 1 });
    await sbc.users.get();

    expect(seen[0].operation).toBe("data.insert");
    expect(seen[0].options).toEqual({ collection: "users" });
    expect("collection" in seen[0]).toBe(false);
    expect(seen[0].payload).toEqual({ name: "Ada" });
    expect(seen[1].operation).toBe("llm.summarize");
    expect(seen[2].operation).toBe("files.list");
    expect(seen[3].operation).toBe("users.get");
    expect(seen[3].payload).toEqual({});
  });

  it("supports arbitrary namespaces via service()", async () => {
    const seen: any[] = [];
    const sbc = SinglebaseClient(
      OPTIONS(
        makeFetch((body) => {
          seen.push(body);
          return {};
        })
      )
    );

    await sbc.service("search").query({ q: "ada" });
    expect(seen[0].operation).toBe("search.query");
  });

  it("dispatch() sends a raw envelope", async () => {
    const seen: any[] = [];
    const sbc = SinglebaseClient(
      OPTIONS(
        makeFetch((body) => {
          seen.push(body);
          return { done: true };
        })
      )
    );

    const result = await sbc.dispatch({ operation: "data.query", payload: { limit: 5 } });
    expect(result).toEqual({ done: true });
    expect(seen[0]).toEqual({ operation: "data.query", payload: { limit: 5 } });
  });

  it("shares one HTTP pipe with the auth client", () => {
    const sbc = SinglebaseClient(OPTIONS(makeFetch(() => ({}))));
    expect(sbc.auth.dispatcher).toBe(sbc.dispatcher);
  });

  it("injects the session bearer into service calls, and omits it when signed out", async () => {
    const headers: any[] = [];
    const fetchMock = jest.fn(async (_url: unknown, init: any) => {
      headers.push(init.headers);
      const body = JSON.parse(init.body);
      const now = Math.floor(Date.now() / 1000);
      if (body.operation === "auth.signin") {
        return {
          ok: true,
          json: async () => ({
            data: {
              id_token: "id-token-xyz",
              refresh_token: "refresh-1",
              token_type: "bearer",
              next_action: null,
              next_operation: null,
              token_info: { ttl: 900, exp: now + 900, iat: now, aud: "web", id: "t1" },
              user_profile: { id: "u1", email: "ada@example.com", roles: [] }
            },
            meta: {},
            exec_time: 0.001
          })
        };
      }
      return { ok: true, json: async () => ({ data: {}, meta: {}, exec_time: 0.001 }) };
    }) as unknown as typeof fetch;

    const sbc = SinglebaseClient(OPTIONS(fetchMock));
    const auth = sbc.auth;
    await auth.ready;

    await sbc.data.query({});
    expect(headers.at(-1).Authorization).toBeUndefined();

    await auth.signIn({ email: "ada@example.com", password: "correct horse" });
    expect(auth.isAuthenticated()).toBe(true);

    await sbc.data.query({});
    expect(headers.at(-1).Authorization).toBe("Bearer id-token-xyz");

    // explicit opt-out
    await sbc.data.query({}, { bearer: null });
    expect(headers.at(-1).Authorization).toBeUndefined();
  });
});

describe("option grouping", () => {
  it("passes auth options through from the auth block", async () => {
    const sbc = SinglebaseClient({
      ...OPTIONS(makeFetch(() => ({}))),
      auth: { autoRefresh: false, crossTab: false }
    });
    // Reaching .auth builds the client; it must not throw on the nested shape.
    expect(sbc.auth.isAuthenticated()).toBe(false);
  });

  it("keeps connection details at the top level, shared by every service", async () => {
    const seen: any[] = [];
    const sbc = SinglebaseClient({
      ...OPTIONS(
        makeFetch((body) => {
          seen.push(body);
          return {};
        })
      ),
      auth: { autoRefresh: false }
    });

    await sbc.data.query({});
    expect(seen[0].operation).toBe("data.query");
    expect(sbc.auth.dispatcher).toBe(sbc.dispatcher);
  });

  it("carries the authui block onto the auth client for the elements to read", () => {
    const sbc = SinglebaseClient({
      ...OPTIONS(makeFetch(() => ({}))),
      auth: { autoRefresh: false },
      authui: { theme: "dark", tokens: { "--sb-accent": "#2f5bea" } }
    });
    expect(sbc.auth.authui).toEqual({
      theme: "dark",
      tokens: { "--sb-accent": "#2f5bea" }
    });
  });

  it("works with neither group given", () => {
    const sbc = SinglebaseClient(OPTIONS(makeFetch(() => ({}))));
    expect(sbc.auth.authui).toBeNull();
  });
});

describe("user namespace", () => {
  it("maps sbc.user to user.* for the signed-in account", async () => {
    const seen: any[] = [];
    const sbc = SinglebaseClient(
      OPTIONS(
        makeFetch((body) => {
          seen.push(body);
          return {};
        })
      )
    );
    await sbc.user.get();
    await sbc.users.list();
    expect(seen.map((b) => b.operation)).toEqual(["user.get", "users.list"]);
  });
});

describe("base URL", () => {
  it("defaults to https://v1.api.singlebase.io and appends the access key", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => ({ data: {}, meta: {}, exec_time: 0 }) };
    }) as unknown as typeof fetch;

    await SinglebaseClient({
      apiKey: "wk_a",
      urlAccessKey: "p1",
      fetch: fetchImpl,
      auth: { autoRefresh: false }
    }).data.query({ collection: "n" });
    await SinglebaseClient({
      apiKey: "wk_b",
      fetch: fetchImpl,
      auth: { autoRefresh: false }
    }).data.query({ collection: "n" });

    expect(urls).toEqual(["https://v1.api.singlebase.io/p1", "https://v1.api.singlebase.io"]);
  });
});

describe("connection options", () => {
  it("needs none of them: no key, default base URL", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, headers: init.headers });
      return { ok: true, json: async () => ({ data: {}, meta: {}, exec_time: 0 }) };
    }) as unknown as typeof fetch;

    await SinglebaseClient({ fetch: fetchImpl, auth: { autoRefresh: false } }).data.query({
      collection: "n"
    });

    expect(calls[0].url).toBe("https://v1.api.singlebase.io");
    expect("X-API-Key" in calls[0].headers).toBe(false);
  });
});
