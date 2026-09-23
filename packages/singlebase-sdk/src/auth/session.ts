import type { AuthSession, AuthState, AuthStorage } from "./types.js";

/** Refresh proactively once the ID token has this many seconds left. */
const REFRESH_SKEW_SECONDS = 60;

export type Refresher = (session: AuthSession) => Promise<AuthSession>;

/**
 * Owns the in-memory session/auth-state, persists it through the configured
 * storage adapter, and coordinates a single in-flight refresh so concurrent
 * callers never race to consume the same (single-use) refresh token.
 */
/** What a cross-tab re-read of storage turned out to mean for this tab. */
export type SyncOutcome = "unchanged" | "adopted" | "cleared";

export class SessionStore {
  private state: AuthState = { status: "loading", session: null, user: null };
  private listeners = new Set<(state: AuthState) => void>();
  private refreshing: Promise<AuthSession> | null = null;

  /**
   * Called whenever *this* tab changes the persisted session. Deliberately
   * not called by syncFromStorage(), so a change received from another tab
   * is never echoed back out.
   */
  onLocalChange: ((kind: "session-changed" | "signout") => void) | null = null;

  constructor(
    private readonly storage: AuthStorage,
    private readonly refresher: Refresher
  ) {}

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** Loads the persisted session (if any) and validates/refreshes it. */
  async initialize(): Promise<void> {
    const stored = await this.storage.get();
    if (!stored) {
      this.setState({ status: "unauthenticated", session: null, user: null });
      return;
    }
    if (this.needsRefresh(stored)) {
      try {
        const refreshed = await this.refreshOnce(stored);
        await this.adopt(refreshed);
      } catch (error) {
        await this.clear();
        this.setState({ status: "error", session: null, user: null, error });
      }
      return;
    }
    this.setState({ status: "authenticated", session: stored, user: stored.user_profile });
  }

  needsRefresh(session: AuthSession): boolean {
    const nowSeconds = Date.now() / 1000;
    return session.token_info.exp - nowSeconds <= REFRESH_SKEW_SECONDS;
  }

  /** Adopts a freshly-returned session: persists it and updates state. */
  async adopt(session: AuthSession): Promise<void> {
    await this.storage.set(session);
    this.setState({ status: "authenticated", session, user: session.user_profile });
    this.onLocalChange?.("session-changed");
  }

  /** Merges an updated profile (from user.get/user.update) into the current session. */
  async adoptProfile(profile: AuthSession["user_profile"]): Promise<void> {
    if (this.state.status !== "authenticated") return;
    const session: AuthSession = { ...this.state.session, user_profile: profile };
    await this.storage.set(session);
    this.setState({ status: "authenticated", session, user: profile });
    this.onLocalChange?.("session-changed");
  }

  async clear(): Promise<void> {
    await this.storage.clear();
    this.setState({ status: "unauthenticated", session: null, user: null });
    this.onLocalChange?.("signout");
  }

  /**
   * Re-reads shared storage after another tab reported a change, and adopts
   * whatever it finds. No network call and no refresh: the tab that made the
   * change already did that work, and this tab must not spend the single-use
   * refresh token a second time.
   */
  async syncFromStorage(): Promise<SyncOutcome> {
    const stored = await this.storage.get();

    if (!stored) {
      if (this.state.status === "unauthenticated") return "unchanged";
      this.setState({ status: "unauthenticated", session: null, user: null });
      return "cleared";
    }

    if (this.state.status === "authenticated" && this.state.session.id_token === stored.id_token) {
      return "unchanged";
    }

    this.setState({ status: "authenticated", session: stored, user: stored.user_profile });
    return "adopted";
  }

  /**
   * Single-flight refresh: concurrent callers await the same in-flight
   * promise instead of each spending the single-use refresh token.
   */
  async refreshOnce(session: AuthSession): Promise<AuthSession> {
    if (!this.refreshing) {
      this.refreshing = this.refresher(session).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /**
   * For a protected call that just failed with an auth-shaped error: refresh
   * once (sharing any in-flight refresh) and hand back the new session, or
   * throw/clear if refresh itself fails. Callers retry their original
   * request exactly once with the result — never loop.
   */
  async refreshAfterFailure(): Promise<AuthSession> {
    if (this.state.status !== "authenticated") {
      throw new Error("Cannot refresh: no authenticated session");
    }
    try {
      const refreshed = await this.refreshOnce(this.state.session);
      await this.adopt(refreshed);
      return refreshed;
    } catch (error) {
      await this.clear();
      throw error;
    }
  }
}
