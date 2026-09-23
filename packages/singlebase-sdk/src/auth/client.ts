import {
  EventEmitter,
  RpcDispatcher,
  SinglebaseError,
  crossTabChannel,
  DEFAULT_BASE_URL,
  defaultStorage,
  type AuthUIConfig,
  noopCrossTabChannel,
  type DispatchEnvelope,
  type DispatchOptions
} from "@singlebase/core";
import { AutoRefreshScheduler } from "./auto-refresh.js";
import { SessionStore } from "./session.js";
import type {
  AcceptInviteInput,
  AuthClientOptions,
  AuthEventMap,
  AuthEventName,
  AuthSession,
  AuthSettings,
  AuthState,
  ChangeEmailInput,
  ChangePasswordInput,
  ChangeUsernameInput,
  CompleteOAuthInput,
  OAuthConnectResult,
  RequestCodeInput,
  RequestCodeResult,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  SignUpResult,
  StartOAuthInput,
  UpdateAccountInput,
  UserProfile
} from "./types.js";

export type { AuthOptions, AuthClientOptions } from "./types.js";

/** RPC operation names, as the auth API defines them. */
const OP = {
  settings: "auth.settings",
  signup: "auth.signup",
  signin: "auth.signin",
  refresh: "auth.refresh",
  signout: "auth.signout",
  requestCode: "auth.request_code",
  confirmCode: "auth.confirm_code",
  changePassword: "auth.change_password",
  getAccount: "user.get",
  updateAccount: "user.update",
  nonce: "auth.nonce",
  oauthConnect: "auth.oauth_connect",
  oauthSignin: "auth.oauth_signin"
} as const;

export interface AuthClient {
  // ── operations ───────────────────────────────────────────
  getSettings(signal?: AbortSignal): Promise<AuthSettings>;
  signUp(input: SignUpInput, signal?: AbortSignal): Promise<SignUpResult>;
  signIn(input: SignInInput, signal?: AbortSignal): Promise<AuthSession>;
  requestCode(input: RequestCodeInput, signal?: AbortSignal): Promise<RequestCodeResult>;
  resetPassword(input: ResetPasswordInput, signal?: AbortSignal): Promise<AuthSession>;
  acceptInvite(input: AcceptInviteInput, signal?: AbortSignal): Promise<AuthSession>;
  refreshSession(): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** Alias of signOut(). */
  logout(): Promise<void>;
  getAccount(signal?: AbortSignal): Promise<UserProfile>;
  updateAccount(input: UpdateAccountInput, signal?: AbortSignal): Promise<UserProfile>;
  changePassword(input: ChangePasswordInput, signal?: AbortSignal): Promise<AuthSession>;
  changeEmail(input: ChangeEmailInput, signal?: AbortSignal): Promise<AuthSession>;
  changeUsername(input: ChangeUsernameInput, signal?: AbortSignal): Promise<AuthSession>;
  createOAuthNonce(signal?: AbortSignal): Promise<string>;
  startOAuth(
    input: Omit<StartOAuthInput, "nonce"> & { nonce?: string },
    signal?: AbortSignal
  ): Promise<OAuthConnectResult>;
  completeOAuth(input: CompleteOAuthInput, signal?: AbortSignal): Promise<AuthSession>;

  // ── state accessors ──────────────────────────────────────
  /** Synchronous: true when a live session is held. */
  isAuthenticated(): boolean;
  /** Current profile, or null when signed out. */
  getUser(): UserProfile | null;
  getSession(): Promise<AuthSession | null>;
  getState(): AuthState;
  /** Resolves once storage has been read and the session validated. */
  readonly ready: Promise<void>;
  readonly user: UserProfile | null;
  readonly authenticated: boolean;

  // ── events / wiring ──────────────────────────────────────
  subscribe(listener: (state: AuthState) => void): () => void;
  on<K extends AuthEventName>(event: K, listener: (detail: AuthEventMap[K]) => void): () => void;
  /** Asks every bound widget to show a screen (multi-widget broadcast). */
  goto(screen: string): void;

  /**
   * Page-wide UI configuration, as passed to SinglebaseClient({ authui }).
   * The singlebase-authui elements read this off whichever client they bind
   * to; nothing in this package interprets it.
   */
  readonly authui: AuthUIConfig | null;

  /** The shared RPC pipe — SinglebaseClient reuses this. */
  readonly dispatcher: RpcDispatcher;
  /** Generic escape hatch for any operation, with bearer injection. */
  dispatch<TResult = unknown, TPayload = unknown>(
    envelope: DispatchEnvelope<TPayload>,
    options?: DispatchOptions
  ): Promise<TResult>;

  /** Stops timers and listeners. */
  destroy(): void;
}

export function createAuthClient(
  options: AuthClientOptions,
  sharedDispatcher?: RpcDispatcher
): AuthClient {
  const audience = options.audience ?? "web";
  const events = new EventEmitter<AuthEventMap>();
  const storage = options.storage ?? defaultStorage<AuthSession>();
  const dispatcher = sharedDispatcher ?? new RpcDispatcher(options);

  for (const [name, handler] of Object.entries(options.on ?? {})) {
    if (handler) events.on(name as AuthEventName, handler as never);
  }

  const doRefresh = async (current: AuthSession): Promise<AuthSession> =>
    dispatcher.dispatch<AuthSession>(
      {
        operation: OP.refresh,
        payload: {
          id_token: current.id_token,
          refresh_token: current.refresh_token,
          aud: audience
        }
      },
      { bearer: null }
    );

  const session = new SessionStore(storage, doRefresh);

  // Cross-tab sync. The channel is keyed per project so two different
  // Singlebase projects open in the same browser never cross-signal.
  const channel =
    options.crossTab === false
      ? noopCrossTabChannel()
      : crossTabChannel(
          `singlebase-auth:${options.baseUrl ?? DEFAULT_BASE_URL}|${options.urlAccessKey ?? ""}`
        );

  session.onLocalChange = (kind) => channel.post(kind);

  const unsubscribeCrossTab = channel.subscribe(() => {
    void ready.then(async () => {
      const outcome = await session.syncFromStorage();
      if (outcome === "unchanged") return;
      if (outcome === "cleared") {
        events.emit("signout", null);
        events.emit("session", null);
        return;
      }
      const state = session.getState();
      if (state.status === "authenticated") events.emit("session", state.session);
    });
  });

  const autoRefreshOptions =
    typeof options.autoRefresh === "boolean"
      ? { enabled: options.autoRefresh }
      : options.autoRefresh;

  const scheduler = new AutoRefreshScheduler(
    autoRefreshOptions,
    async () => {
      const refreshed = await client.refreshSession();
      return refreshed;
    },
    (error) => {
      // The refresh token is single-use; a rejection means the session is
      // unrecoverable. Drop it and tell the app, rather than retrying.
      void session.clear();
      const code = error instanceof SinglebaseError ? error.code : "REFRESH_FAILED";
      events.emit("expired", { reason: code });
      events.emit("session", null);
    }
  );

  // The dispatcher injects this client's token into every service call and
  // recovers a stale one exactly once.
  dispatcher.setAuthBridge({
    getToken: () => {
      const state = session.getState();
      return state.status === "authenticated" ? state.session.id_token : null;
    },
    refresh: async () => {
      try {
        const refreshed = await session.refreshAfterFailure();
        return refreshed.id_token;
      } catch {
        return null;
      }
    }
  });

  session.subscribe((state) => {
    if (state.status === "authenticated") {
      scheduler.reset();
      scheduler.start(state.session);
    } else {
      scheduler.stop();
    }
  });

  const ready = session.initialize().then(() => {
    events.emit("load", session.getState());
  });

  /** Emits success/error around an operation without duplicating try/catch. */
  async function track<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      const data = await run();
      events.emit("success", { operation });
      return data;
    } catch (error) {
      const code = error instanceof SinglebaseError ? error.code : "UNKNOWN_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      events.emit("error", { code, message, operation });
      throw error;
    }
  }

  const call = <TResult, TPayload>(
    operation: string,
    payload: TPayload,
    opts: DispatchOptions = {}
  ): Promise<TResult> => dispatcher.dispatch<TResult, TPayload>({ operation, payload }, opts);

  const client: AuthClient = {
    ready,
    dispatcher,
    authui: options.authui ?? null,

    dispatch: (envelope, opts) => dispatcher.dispatch(envelope, opts),

    getSettings: (signal) =>
      track(OP.settings, () => call<AuthSettings, {}>(OP.settings, {}, { bearer: null, signal })),

    signUp: (input, signal) =>
      track(OP.signup, async () => {
        const result = await call<SignUpResult, SignUpInput>(
          OP.signup,
          { ...input, aud: input.aud ?? audience },
          { bearer: null, signal }
        );
        events.emit("signup", result);
        events.emit("navigate", {
          next_action: result.next_action,
          next_operation: result.next_operation
        });
        return result;
      }),

    signIn: (input, signal) =>
      track(OP.signin, async () => {
        const result = await call<AuthSession, SignInInput>(
          OP.signin,
          { ...input, aud: input.aud ?? audience },
          { bearer: null, signal }
        );
        await session.adopt(result);
        events.emit("signin", result);
        events.emit("session", result);
        return result;
      }),

    requestCode: (input, signal) =>
      track(OP.requestCode, async () => {
        const result = await call<RequestCodeResult, RequestCodeInput>(
          OP.requestCode,
          { ...input, aud: input.aud ?? audience },
          { bearer: null, signal }
        );
        events.emit("navigate", {
          next_action: result.next_action,
          next_operation: result.next_operation
        });
        return result;
      }),

    resetPassword: (input, signal) =>
      track(OP.confirmCode, async () => {
        const result = await call<AuthSession, unknown>(
          OP.confirmCode,
          { ...input, purpose: "password_reset", aud: input.aud ?? audience },
          { bearer: null, signal }
        );
        await session.adopt(result);
        events.emit("signin", result);
        events.emit("session", result);
        return result;
      }),

    acceptInvite: (input, signal) =>
      track(OP.signin, async () => {
        const result = await call<AuthSession, AcceptInviteInput>(
          OP.signin,
          { ...input, aud: input.aud ?? audience },
          { bearer: null, signal }
        );
        await session.adopt(result);
        events.emit("signin", result);
        events.emit("session", result);
        return result;
      }),

    refreshSession: () =>
      track(OP.refresh, async () => {
        const state = session.getState();
        if (state.status !== "authenticated") {
          throw new Error("Cannot refresh: no authenticated session");
        }
        const refreshed = await session.refreshOnce(state.session);
        await session.adopt(refreshed);
        events.emit("session", refreshed);
        return refreshed;
      }),

    async signOut() {
      const state = session.getState();
      scheduler.stop();
      if (state.status === "authenticated") {
        try {
          await call<{ signout: boolean }, {}>(OP.signout, {}, { bearer: state.session.id_token });
        } catch {
          // Local state is cleared whether or not the server call succeeds.
        }
      }
      await session.clear();
      events.emit("signout", null);
      events.emit("session", null);
      events.emit("success", { operation: OP.signout });
    },

    logout() {
      return client.signOut();
    },

    getAccount: (signal) =>
      track(OP.getAccount, async () => {
        const profile = await call<UserProfile, {}>(OP.getAccount, {}, { signal });
        await session.adoptProfile(profile);
        return profile;
      }),

    updateAccount: (input, signal) =>
      track(OP.updateAccount, async () => {
        const profile = await call<UserProfile, UpdateAccountInput>(OP.updateAccount, input, {
          signal
        });
        await session.adoptProfile(profile);
        events.emit("account-updated", profile);
        return profile;
      }),

    changePassword: (input, signal) =>
      track(OP.changePassword, async () => {
        const result = await call<AuthSession, ChangePasswordInput>(
          OP.changePassword,
          { ...input, aud: input.aud ?? audience },
          { signal }
        );
        await session.adopt(result);
        events.emit("password-change", result);
        events.emit("session", result);
        return result;
      }),

    changeEmail: (input, signal) =>
      track(OP.confirmCode, async () => {
        const result = await call<AuthSession, unknown>(
          OP.confirmCode,
          {
            email: input.email,
            purpose: "email_change",
            code: input.code,
            new_email: input.new_email,
            aud: input.aud ?? audience
          },
          { signal }
        );
        await session.adopt(result);
        events.emit("email-change", result);
        events.emit("session", result);
        return result;
      }),

    changeUsername: (input, signal) =>
      track(OP.confirmCode, async () => {
        const result = await call<AuthSession, unknown>(
          OP.confirmCode,
          {
            email: input.email,
            purpose: "username_change",
            code: input.code,
            new_username: input.new_username,
            aud: input.aud ?? audience
          },
          { signal }
        );
        await session.adopt(result);
        events.emit("username-change", result);
        events.emit("session", result);
        return result;
      }),

    createOAuthNonce: (signal) =>
      track(OP.nonce, async () => {
        const result = await call<{ nonce: string }, {}>(OP.nonce, {}, { bearer: null, signal });
        return result.nonce;
      }),

    startOAuth: (input, signal) =>
      track(OP.oauthConnect, async () => {
        const nonce = input.nonce ?? (await client.createOAuthNonce(signal));
        return call<OAuthConnectResult, unknown>(
          OP.oauthConnect,
          { ...input, nonce, intent: input.intent ?? "signin", aud: input.aud ?? audience },
          { bearer: null, signal }
        );
      }),

    completeOAuth: (input, signal) =>
      track(OP.oauthSignin, async () => {
        const result = await call<AuthSession, CompleteOAuthInput>(
          OP.oauthSignin,
          { ...input, aud: input.aud ?? audience },
          { bearer: null, signal }
        );
        await session.adopt(result);
        events.emit("signin", result);
        events.emit("session", result);
        return result;
      }),

    isAuthenticated: () => session.getState().status === "authenticated",

    getUser: () => {
      const state = session.getState();
      return state.status === "authenticated" ? state.user : null;
    },

    get user() {
      return client.getUser();
    },

    get authenticated() {
      return client.isAuthenticated();
    },

    async getSession() {
      await ready;
      const state = session.getState();
      return state.status === "authenticated" ? state.session : null;
    },

    getState: () => session.getState(),

    subscribe: (listener) => session.subscribe(listener),

    on: events.on.bind(events),

    goto: (screen) => events.emit("goto", { screen }),

    destroy() {
      scheduler.stopPermanently();
      dispatcher.setAuthBridge(null);
      session.onLocalChange = null;
      unsubscribeCrossTab();
      channel.close();
    }
  };

  return client;
}
