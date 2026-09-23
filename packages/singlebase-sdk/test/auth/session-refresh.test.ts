import { jest } from "@jest/globals";
import { SessionStore } from "../../src/auth/session.js";
import { memoryStorage } from "@singlebase/core";
import type { AuthSession } from "../../src/auth/types.js";

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    id_token: "id-1",
    refresh_token: "refresh-1",
    token_type: "bearer",
    user_profile: {
      id: "u1",
      email: "ada@example.com",
      username: null,
      phone: null,
      first_name: "Ada",
      last_name: "Lovelace",
      profile_photo: null,
      status: "active",
      requires_password_change: false,
      email_verified_at: null,
      phone_verified_at: null,
      created_at: null,
      modified_at: null,
      timezone: null,
      locale: null,
      metadata: null,
      aud: "web",
      roles: []
    },
    next_action: null,
    next_operation: null,
    token_info: {
      ttl: 900,
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
      aud: "web",
      id: "t1"
    },
    ...overrides
  };
}

describe("SessionStore single-flight refresh", () => {
  it("shares one in-flight refresh across concurrent callers", async () => {
    const refresher = jest.fn(async (session: AuthSession) =>
      makeSession({ id_token: "id-2", refresh_token: "refresh-2" })
    );
    const store = new SessionStore(memoryStorage(), refresher);
    const session = makeSession();

    const [a, b, c] = await Promise.all([
      store.refreshOnce(session),
      store.refreshOnce(session),
      store.refreshOnce(session)
    ]);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(a.id_token).toBe("id-2");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("allows a new refresh after the previous one settles", async () => {
    let call = 0;
    const refresher = jest.fn(async () => {
      call += 1;
      return makeSession({ id_token: `id-${call}` });
    });
    const store = new SessionStore(memoryStorage(), refresher);

    const first = await store.refreshOnce(makeSession());
    const second = await store.refreshOnce(makeSession());

    expect(refresher).toHaveBeenCalledTimes(2);
    expect(first.id_token).toBe("id-1");
    expect(second.id_token).toBe("id-2");
  });

  it("clears local session when refreshAfterFailure's refresh itself fails", async () => {
    const storage = memoryStorage();
    const refresher = jest.fn(async () => {
      throw new Error("refresh token expired");
    });
    const store = new SessionStore(storage, refresher);
    await storage.set(makeSession());
    await store.initialize();
    expect(store.getState().status).toBe("authenticated");

    await expect(store.refreshAfterFailure()).rejects.toThrow("refresh token expired");
    expect(store.getState().status).toBe("unauthenticated");
    expect(await storage.get()).toBeNull();
  });

  it("initialize() refreshes a session that is near expiry", async () => {
    const storage = memoryStorage();
    await storage.set(
      makeSession({
        token_info: {
          ttl: 900,
          exp: Math.floor(Date.now() / 1000) + 10,
          iat: 0,
          aud: "web",
          id: "t1"
        }
      })
    );
    const refresher = jest.fn(async () => makeSession({ id_token: "fresh" }));
    const store = new SessionStore(storage, refresher);

    await store.initialize();

    expect(refresher).toHaveBeenCalledTimes(1);
    const state = store.getState();
    expect(state.status).toBe("authenticated");
    if (state.status === "authenticated") {
      expect(state.session.id_token).toBe("fresh");
    }
  });
});
