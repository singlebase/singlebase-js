import type { AuthSession } from "./types.js";

export interface AutoRefreshOptions {
  /** Master switch. Default: true. */
  enabled?: boolean;
  /**
   * Refresh this many seconds before `token_info.exp`. Default: 60.
   */
  skewSeconds?: number;
  /**
   * Pause refreshing once the user has been inactive for this long. The
   * session is left alone (not cleared) and refresh resumes on the next
   * interaction. Default: 15 minutes.
   */
  idleAfterMs?: number;
  /** Never schedule two refreshes closer together than this. Default: 30s. */
  minIntervalMs?: number;
  /** DOM events that count as activity. */
  activityEvents?: string[];
}

const DEFAULT_ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus", "touchstart"];

const DEFAULTS = {
  enabled: true,
  skewSeconds: 60,
  idleAfterMs: 15 * 60 * 1000,
  minIntervalMs: 30 * 1000
};

/**
 * Keeps a session alive for as long as the user is actually using the app.
 *
 * Schedules a refresh shortly before the ID token expires. If the user has
 * been idle past `idleAfterMs` when that moment arrives, the refresh is
 * deferred until they interact again — so a tab left open overnight stops
 * talking to the server instead of renewing forever. A refresh that fails
 * stops the loop permanently (the caller clears the session): the refresh
 * token is single-use and a rejection means the session is gone, so retrying
 * would just hammer the endpoint.
 */
export class AutoRefreshScheduler {
  private options: Required<Omit<AutoRefreshOptions, "activityEvents">> & {
    activityEvents: string[];
  };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = Date.now();
  private stopped = false;
  private listening = false;
  private pendingWake = false;
  private onActivityBound = () => this.onActivity();

  constructor(
    options: AutoRefreshOptions | undefined,
    private readonly refresh: () => Promise<AuthSession>,
    private readonly onFailure: (error: unknown) => void
  ) {
    this.options = {
      enabled: options?.enabled ?? DEFAULTS.enabled,
      skewSeconds: options?.skewSeconds ?? DEFAULTS.skewSeconds,
      idleAfterMs: options?.idleAfterMs ?? DEFAULTS.idleAfterMs,
      minIntervalMs: options?.minIntervalMs ?? DEFAULTS.minIntervalMs,
      activityEvents: options?.activityEvents ?? DEFAULT_ACTIVITY_EVENTS
    };
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** (Re)arms the scheduler for the given session. */
  start(session: AuthSession): void {
    if (!this.options.enabled || this.stopped) return;
    this.listen();
    this.schedule(session);
  }

  /** Pauses until the next `start()` — used on signout. */
  stop(): void {
    this.clearTimer();
    this.unlisten();
  }

  /**
   * Stops for good. Used when a refresh fails: the session cannot be
   * recovered without a fresh sign-in, so the loop must not restart by
   * itself.
   */
  stopPermanently(): void {
    this.stopped = true;
    this.stop();
  }

  /** Allows a future sign-in to resume auto-refresh after a permanent stop. */
  reset(): void {
    this.stopped = false;
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private listen() {
    if (this.listening || typeof globalThis.addEventListener !== "function") return;
    for (const event of this.options.activityEvents) {
      globalThis.addEventListener(event, this.onActivityBound, { passive: true, capture: true });
    }
    globalThis.addEventListener?.("visibilitychange", this.onActivityBound, { passive: true });
    this.listening = true;
  }

  private unlisten() {
    if (!this.listening || typeof globalThis.removeEventListener !== "function") return;
    for (const event of this.options.activityEvents) {
      globalThis.removeEventListener(event, this.onActivityBound, {
        capture: true
      } as EventListenerOptions);
    }
    globalThis.removeEventListener?.("visibilitychange", this.onActivityBound);
    this.listening = false;
  }

  /**
   * Marks the user as active. Called by the DOM listeners, and available to
   * hosts that know about activity the DOM cannot see — an SPA route change,
   * a websocket message, a background save.
   */
  notifyActivity(): void {
    this.onActivity();
  }

  private onActivity() {
    this.lastActivityAt = Date.now();
    // A refresh that came due while the user was away runs as soon as they
    // come back, so the next API call does not race an expired token.
    if (this.pendingWake && !this.stopped) {
      this.pendingWake = false;
      void this.run();
    }
  }

  private get isIdle(): boolean {
    return Date.now() - this.lastActivityAt > this.options.idleAfterMs;
  }

  private schedule(session: AuthSession) {
    this.clearTimer();
    if (this.stopped || !this.options.enabled) return;

    const expiresInMs = session.token_info.exp * 1000 - Date.now();
    const delay = Math.max(
      expiresInMs - this.options.skewSeconds * 1000,
      this.options.minIntervalMs
    );

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.isIdle) {
        // Defer: do nothing until the user touches the page again.
        this.pendingWake = true;
        return;
      }
      void this.run();
    }, delay);
  }

  private async run() {
    if (this.stopped) return;
    try {
      const session = await this.refresh();
      this.schedule(session);
    } catch (error) {
      this.stopPermanently();
      this.onFailure(error);
    }
  }
}
