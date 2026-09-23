import { jest } from "@jest/globals";
import { AutoRefreshScheduler } from "../../src/auth/auto-refresh.js";
import type { AuthSession } from "../../src/auth/types.js";

function sessionExpiringIn(seconds: number): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    id_token: "id",
    refresh_token: "refresh",
    token_type: "bearer",
    next_action: null,
    next_operation: null,
    token_info: { ttl: seconds, exp: now + seconds, iat: now, aud: "web", id: "t1" },
    user_profile: {} as AuthSession["user_profile"]
  };
}

describe("AutoRefreshScheduler", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("refreshes shortly before expiry and re-arms from the new session", async () => {
    const refresh = jest.fn(async () => sessionExpiringIn(900));
    const scheduler = new AutoRefreshScheduler(
      { skewSeconds: 60, minIntervalMs: 1000, idleAfterMs: 24 * 60 * 60 * 1000 },
      refresh as never,
      () => {}
    );

    scheduler.start(sessionExpiringIn(900));
    expect(refresh).not.toHaveBeenCalled();

    // 900s token, 60s skew → fires at ~840s
    await jest.advanceTimersByTimeAsync(840_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    // the new session re-arms the timer
    await jest.advanceTimersByTimeAsync(840_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("never schedules closer together than minIntervalMs", async () => {
    const refresh = jest.fn(async () => sessionExpiringIn(1));
    const scheduler = new AutoRefreshScheduler(
      { skewSeconds: 60, minIntervalMs: 30_000 },
      refresh as never,
      () => {}
    );

    // already past the skew window — must still wait the floor, not fire hot
    scheduler.start(sessionExpiringIn(1));
    await jest.advanceTimersByTimeAsync(29_000);
    expect(refresh).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops permanently when a refresh fails and reports it once", async () => {
    const refresh = jest.fn(async () => {
      throw new Error("refresh token expired");
    });
    const onFailure = jest.fn();
    const scheduler = new AutoRefreshScheduler(
      { skewSeconds: 60, minIntervalMs: 1000, idleAfterMs: 24 * 60 * 60 * 1000 },
      refresh as never,
      onFailure
    );

    scheduler.start(sessionExpiringIn(900));
    await jest.advanceTimersByTimeAsync(840_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(scheduler.isRunning).toBe(false);

    // a permanent stop must not resume on its own
    await jest.advanceTimersByTimeAsync(10_000_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    // and a fresh sign-in must not restart it until reset()
    scheduler.start(sessionExpiringIn(900));
    await jest.advanceTimersByTimeAsync(840_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.reset();
    scheduler.start(sessionExpiringIn(900));
    await jest.advanceTimersByTimeAsync(840_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("defers the refresh while the user is idle", async () => {
    const refresh = jest.fn(async () => sessionExpiringIn(900));
    const scheduler = new AutoRefreshScheduler(
      { skewSeconds: 60, minIntervalMs: 1000, idleAfterMs: 1000 },
      refresh as never,
      () => {}
    );

    scheduler.start(sessionExpiringIn(900));
    // by the time it fires, far more than idleAfterMs has passed with no events
    await jest.advanceTimersByTimeAsync(840_000);
    expect(refresh).not.toHaveBeenCalled();

    // returning to the page refreshes immediately
    scheduler.notifyActivity();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("can be disabled entirely", async () => {
    const refresh = jest.fn(async () => sessionExpiringIn(900));
    const scheduler = new AutoRefreshScheduler({ enabled: false }, refresh as never, () => {});
    scheduler.start(sessionExpiringIn(900));
    await jest.advanceTimersByTimeAsync(10_000_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
