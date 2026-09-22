import { jest } from "@jest/globals";
import { createAuthClient } from "../src/client.js";
import type { AuthClientOptions, AuthSession, AuthStorage } from "../src/types.js";

/**
 * Two clients standing in for two browser tabs: separate SessionStores,
 * separate schedulers, but one *shared* storage, which is what IndexedDB is
 * across tabs of an origin.
 */

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<(event: { data: unknown }) => void>();

  constructor(public name: string) {
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }
  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (peer === this) continue; // real BroadcastChannel does not self-deliver
      for (const listener of peer.listeners) listener({ data });
    }
  }
  addEventListener(_t: string, l: (event: { data: unknown }) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_t: string, l: (event: { data: unknown }) => void) {
    this.listeners.delete(l);
  }
  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
  static reset() {
    FakeBroadcastChannel.channels.clear();
  }
}

/** One storage object handed to both clients — the shared-IndexedDB stand-in. */
function sharedStorage(): AuthStorage {
  let value: AuthSession | null = null;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
    clear: () => {
      value = null;
    }
  };
}

function makeSession(over: Partial<AuthSession> = {}): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    id_token: "id-1",
    refresh_token: "refresh-1",
    token_type: "bearer",
    next_action: null,
    next_operation: null,
    token_info: { ttl: 900, exp: now + 900, iat: now, aud: "web", id: "t1" },
    user_profile: { id: "u1", email: "ada@example.com", roles: [] } as never,
    ...over
  };
}

function fetchReturning(session: () => AuthSession) {
  return jest.fn(async (_url: unknown, _init: any) => ({
    ok: true,
    json: async () => ({ data: session(), meta: {}, exec_time: 0.001 })
  })) as unknown as typeof fetch;
}

const OPTIONS = (storage: AuthStorage, fetchImpl: typeof fetch): AuthClientOptions => ({
  baseUrl: "https://api.example.com",
  urlAccessKey: "proj-1",
  apiKey: "wk_test",
  fetch: fetchImpl,
  autoRefresh: false,
  storage
});

const globalScope = globalThis as Record<string, unknown>;
const originalBC = globalScope.BroadcastChannel;

/** Lets queued microtasks (the cross-tab handler chain) settle. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe("cross-tab session sync", () => {
  beforeEach(() => {
    FakeBroadcastChannel.reset();
    globalScope.BroadcastChannel = FakeBroadcastChannel;
  });

  afterEach(() => {
    globalScope.BroadcastChannel = originalBC;
  });

  it("signing in on one tab authenticates the other", async () => {
    const storage = sharedStorage();
    const session = makeSession();
    const tabA = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    const tabB = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    await Promise.all([tabA.ready, tabB.ready]);

    expect(tabB.isAuthenticated()).toBe(false);

    await tabA.signIn({ email: "ada@example.com", password: "correct horse" });
    await settle();

    expect(tabB.isAuthenticated()).toBe(true);
    expect(tabB.getUser()?.email).toBe("ada@example.com");

    tabA.destroy();
    tabB.destroy();
  });

  it("signing out on one tab signs the other out and emits signout there", async () => {
    const storage = sharedStorage();
    const session = makeSession();
    const tabA = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    const tabB = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    await Promise.all([tabA.ready, tabB.ready]);

    await tabA.signIn({ email: "ada@example.com", password: "correct horse" });
    await settle();
    expect(tabB.isAuthenticated()).toBe(true);

    const signedOut = jest.fn();
    tabB.on("signout", signedOut);

    await tabA.signOut();
    await settle();

    expect(tabB.isAuthenticated()).toBe(false);
    expect(signedOut).toHaveBeenCalledTimes(1);

    tabA.destroy();
    tabB.destroy();
  });

  it("the receiving tab adopts the stored session without spending a refresh token", async () => {
    const storage = sharedStorage();
    const session = makeSession();
    const fetchA = fetchReturning(() => session);
    const fetchB = fetchReturning(() => session);
    const tabA = createAuthClient(OPTIONS(storage, fetchA));
    const tabB = createAuthClient(OPTIONS(storage, fetchB));
    await Promise.all([tabA.ready, tabB.ready]);

    const callsBefore = (fetchB as unknown as jest.Mock).mock.calls.length;
    await tabA.signIn({ email: "ada@example.com", password: "correct horse" });
    await settle();

    expect(tabB.isAuthenticated()).toBe(true);
    expect((fetchB as unknown as jest.Mock).mock.calls.length).toBe(callsBefore);

    tabA.destroy();
    tabB.destroy();
  });

  it("crossTab: false opts out entirely", async () => {
    const storage = sharedStorage();
    const session = makeSession();
    const tabA = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    const tabB = createAuthClient({
      ...OPTIONS(
        storage,
        fetchReturning(() => session)
      ),
      crossTab: false
    });
    await Promise.all([tabA.ready, tabB.ready]);

    await tabA.signIn({ email: "ada@example.com", password: "correct horse" });
    await settle();

    expect(tabB.isAuthenticated()).toBe(false);

    tabA.destroy();
    tabB.destroy();
  });

  it("destroy() stops a client from following further changes", async () => {
    const storage = sharedStorage();
    const session = makeSession();
    const tabA = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    const tabB = createAuthClient(
      OPTIONS(
        storage,
        fetchReturning(() => session)
      )
    );
    await Promise.all([tabA.ready, tabB.ready]);

    tabB.destroy();
    await tabA.signIn({ email: "ada@example.com", password: "correct horse" });
    await settle();

    expect(tabB.isAuthenticated()).toBe(false);
    tabA.destroy();
  });
});
