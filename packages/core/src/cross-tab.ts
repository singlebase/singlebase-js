/**
 * Cross-tab coordination.
 *
 * When a user signs in or out in one tab, every other tab of the same origin
 * should follow. The signal deliberately carries *no session data*: peers are
 * only told "something changed", and they re-read the shared storage
 * themselves. That keeps tokens out of BroadcastChannel payloads and out of
 * the localStorage fallback key entirely, so the encrypted-at-rest guarantee
 * in storage.ts is never bypassed by the sync mechanism.
 *
 * Note this only *works* when the underlying storage is itself shared between
 * tabs (IndexedDB is; sessionStorage is not). With the sessionStorage
 * fallback the peer re-reads its own private copy, finds it unchanged, and
 * does nothing — degraded, but never wrong.
 */

export type CrossTabSignal = "session-changed" | "signout";

export interface CrossTabMessage {
  signal: CrossTabSignal;
  /** Sender id, so a channel can ignore its own echo. */
  from: string;
  at: number;
}

export interface CrossTabChannel {
  post(signal: CrossTabSignal): void;
  subscribe(listener: (message: CrossTabMessage) => void): () => void;
  close(): void;
}

const noop = () => {};

/** A channel that does nothing — used when cross-tab sync is disabled or unavailable. */
export function noopCrossTabChannel(): CrossTabChannel {
  return { post: noop, subscribe: () => noop, close: noop };
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Prefers BroadcastChannel; falls back to a localStorage `storage` event,
 * which fires only in *other* tabs, exactly the semantics we want. Returns a
 * no-op channel when neither is available (SSR, tests, locked-down origins).
 */
export function crossTabChannel(name: string): CrossTabChannel {
  const id = newId();

  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (BC) {
    let channel: BroadcastChannel;
    try {
      channel = new BC(name);
    } catch {
      return storageEventChannel(name, id);
    }
    return {
      post(signal) {
        try {
          channel.postMessage({ signal, from: id, at: Date.now() } satisfies CrossTabMessage);
        } catch {
          // A closed or blocked channel must never break the auth flow.
        }
      },
      subscribe(listener) {
        const handler = (event: MessageEvent) => {
          const message = event.data as CrossTabMessage | null;
          if (!message || typeof message !== "object") return;
          if (message.from === id) return;
          if (message.signal !== "session-changed" && message.signal !== "signout") return;
          listener(message);
        };
        channel.addEventListener("message", handler);
        return () => channel.removeEventListener("message", handler);
      },
      close() {
        try {
          channel.close();
        } catch {
          // already closed
        }
      }
    };
  }

  return storageEventChannel(name, id);
}

function storageEventChannel(name: string, id: string): CrossTabChannel {
  const store = safeLocalStorage();
  if (!store) return noopCrossTabChannel();

  const key = `${name}:signal`;

  return {
    post(signal) {
      try {
        store.setItem(key, JSON.stringify({ signal, from: id, at: Date.now() }));
      } catch {
        // Quota or private-mode failures are non-fatal.
      }
    },
    subscribe(listener) {
      const handler = (event: StorageEvent) => {
        if (event.key !== key || !event.newValue) return;
        try {
          const message = JSON.parse(event.newValue) as CrossTabMessage;
          if (message.from === id) return;
          if (message.signal !== "session-changed" && message.signal !== "signout") return;
          listener(message);
        } catch {
          // Ignore anything that is not one of our messages.
        }
      };
      globalThis.addEventListener?.("storage", handler as EventListener);
      return () => globalThis.removeEventListener?.("storage", handler as EventListener);
    },
    close: noop
  };
}

function safeLocalStorage(): Storage | null {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const probe = "__singlebase_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}
