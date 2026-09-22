import type { AuthClient, AuthSession, AuthState, UserProfile } from "@singlebase/auth";

export function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
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
    roles: [],
    ...overrides
  };
}

export function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    id_token: "id-1",
    refresh_token: "refresh-1",
    token_type: "bearer",
    user_profile: makeUserProfile(),
    next_action: null,
    next_operation: null,
    token_info: { ttl: 900, exp: now + 900, iat: now, aud: "web", id: "t1" },
    ...overrides
  };
}

/**
 * A minimal, fully in-memory stand-in for AuthClient. Every method is a
 * jasmine/sinon-free stub: tests override `.impl.<method>` to control what a
 * call resolves/rejects with, then assert on `.calls`.
 */
export function createMockClient(
  initialState: AuthState = { status: "unauthenticated", session: null, user: null }
): AuthClient & {
  calls: Record<string, unknown[][]>;
  setState(state: AuthState): void;
} {
  const listeners = new Set<(state: AuthState) => void>();
  let state = initialState;
  const calls: Record<string, unknown[][]> = {};

  function record(name: string, args: unknown[]) {
    (calls[name] ??= []).push(args);
  }

  function setState(next: AuthState) {
    state = next;
    listeners.forEach((l) => l(next));
  }

  const client: any = {
    ready: Promise.resolve(),
    getState: () => state,
    subscribe: (listener: (s: AuthState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    on: () => () => {},
    isAuthenticated: () => state.status === "authenticated",
    getUser: () => (state.status === "authenticated" ? state.user : null),
    goto: () => {},
    logout: async () => {
      record("logout", []);
      setState({ status: "unauthenticated", session: null, user: null });
    },
    setState,
    calls
  };

  const methods = [
    "getSettings",
    "signUp",
    "signIn",
    "requestCode",
    "resetPassword",
    "acceptInvite",
    "refreshSession",
    "signOut",
    "getAccount",
    "updateAccount",
    "changePassword",
    "changeEmail",
    "changeUsername",
    "createOAuthNonce",
    "startOAuth",
    "completeOAuth",
    "getSession"
  ];
  for (const name of methods) {
    if (client[name]) continue; // keep the real stubs defined above
    client[name] = async (...args: unknown[]) => {
      record(name, args);
      throw new Error(`mock ${name} not stubbed`);
    };
  }

  return client;
}
