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
  autoRefresh: false
});

describe("SinglebaseClient", () => {
  it("maps namespace methods to <namespace>.<method> operations", async () => {
    const seen: any[] = [];
    const fetchMock = makeFetch((body) => {
      seen.push(body);
      return { ok: true };
    });
    const sbc = SinglebaseClient(OPTIONS(fetchMock));

    await sbc.data.insert({ name: "Ada" }, { collection: "users" });
    await sbc.llm.summarize({ text: "hello" });
    await sbc.files.upload({ id: 1 });
    await sbc.users.get();

    expect(seen[0].operation).toBe("data.insert");
    expect(seen[0].collection).toBe("users");
    expect(seen[0].payload).toEqual({ name: "Ada" });
    expect(seen[1].operation).toBe("llm.summarize");
    expect(seen[2].operation).toBe("files.upload");
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
