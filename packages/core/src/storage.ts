import type { SinglebaseStorage } from "./types.js";

const DB_NAME = "singlebase-auth";
const DB_VERSION = 1;
const STORE = "session";
const KEY_ID = "wrapping-key";
const DATA_ID = "session";

/** In-memory storage. Never persisted — safest, but the session ends on reload. */
export function memoryStorage<T = unknown>(): SinglebaseStorage<T> {
  let current: T | null = null;
  return {
    get: () => current,
    set: (session) => {
      current = session;
    },
    clear: () => {
      current = null;
    }
  };
}

function webStorageAdapter<T>(
  getStorage: () => Storage | undefined,
  key: string
): SinglebaseStorage<T> {
  return {
    get: () => {
      const raw = getStorage()?.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    set: (session) => {
      getStorage()?.setItem(key, JSON.stringify(session));
    },
    clear: () => {
      getStorage()?.removeItem(key);
    }
  };
}

/**
 * Persists the session in `localStorage` as plain text. Survives reloads and
 * is shared across tabs, but any script on the origin — including an XSS
 * payload — can read the tokens verbatim. Choose this deliberately.
 */
export function localStorageAdapter<T = unknown>(
  key = "singlebase-auth-session"
): SinglebaseStorage<T> {
  return webStorageAdapter(() => globalThis.localStorage, key);
}

/** Persists the session in `sessionStorage` — plain text, cleared with the tab. */
export function sessionStorageAdapter<T = unknown>(
  key = "singlebase-auth-session"
): SinglebaseStorage<T> {
  return webStorageAdapter(() => globalThis.sessionStorage, key);
}

// ---------------------------------------------------------------------------
// IndexedDB + non-extractable CryptoKey
// ---------------------------------------------------------------------------

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

async function idbRead<T>(id: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    return await idbRequest<T>(tx.objectStore(STORE).get(id) as IDBRequest<T>);
  } finally {
    db.close();
  }
}

async function idbWrite(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbRequest(tx.objectStore(STORE).put(value, id));
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbRequest(tx.objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

/** True when this environment can do IndexedDB + WebCrypto (a secure context). */
export function canUseCryptoStorage(): boolean {
  return (
    typeof globalThis.indexedDB !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
}

interface EncryptedRecord {
  // Pinned to ArrayBuffer (not ArrayBufferLike) so it satisfies BufferSource.
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

/**
 * Persists the session in IndexedDB, encrypted with an AES-GCM key that is
 * generated as **non-extractable** and itself stored in IndexedDB.
 *
 * The point is not that IndexedDB is inherently safer than localStorage — for
 * an XSS payload sitting on the page, both are readable. The point is that
 * the key's raw material can never be read by JavaScript at all, so the
 * tokens at rest cannot be exfiltrated and replayed later or from another
 * machine: an attacker has to stay resident on the page to use them. That
 * turns durable token theft into session-scoped abuse.
 */
export function indexedDbCryptoStorage<T = unknown>(): SinglebaseStorage<T> {
  let keyPromise: Promise<CryptoKey> | null = null;

  async function getKey(): Promise<CryptoKey> {
    if (!keyPromise) {
      keyPromise = (async () => {
        const existing = await idbRead<CryptoKey>(KEY_ID);
        if (existing) return existing;
        const key = await globalThis.crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          // non-extractable: crypto.subtle can use it, JS can never read it
          false,
          ["encrypt", "decrypt"]
        );
        await idbWrite(KEY_ID, key);
        return key;
      })().catch((error) => {
        keyPromise = null;
        throw error;
      });
    }
    return keyPromise;
  }

  return {
    async get() {
      const record = await idbRead<EncryptedRecord>(DATA_ID);
      if (!record) return null;
      try {
        const key = await getKey();
        const plain = await globalThis.crypto.subtle.decrypt(
          { name: "AES-GCM", iv: record.iv },
          key,
          record.data
        );
        return JSON.parse(new TextDecoder().decode(plain)) as T;
      } catch {
        // Wrong/rotated key or corrupt record — drop it rather than throw.
        await idbDelete(DATA_ID).catch(() => {});
        return null;
      }
    },

    async set(session) {
      const key = await getKey();
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const data = await globalThis.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(JSON.stringify(session))
      );
      await idbWrite(DATA_ID, { iv, data } satisfies EncryptedRecord);
    },

    async clear() {
      await idbDelete(DATA_ID).catch(() => {});
    }
  };
}

/**
 * The default adapter: encrypted IndexedDB when the environment supports it,
 * otherwise `sessionStorage`, otherwise memory. Detection is lazy and each
 * operation degrades on failure, so a blocked/absent IndexedDB (private
 * windows, disabled site data) never breaks sign-in — it just stops the
 * session surviving a reload.
 */
export function defaultStorage<T = unknown>(): SinglebaseStorage<T> {
  let backing: SinglebaseStorage<T> | null = null;
  let probed = false;

  async function resolve(): Promise<SinglebaseStorage<T>> {
    if (backing) return backing;
    if (!probed) {
      probed = true;
      if (canUseCryptoStorage()) {
        const candidate = indexedDbCryptoStorage<T>();
        try {
          // Round-trip nothing, but force the key + a transaction to open so
          // an unusable IndexedDB is discovered now rather than at signin.
          await candidate.get();
          backing = candidate;
          return backing;
        } catch {
          // fall through
        }
      }
      backing =
        typeof globalThis.sessionStorage !== "undefined"
          ? sessionStorageAdapter<T>()
          : memoryStorage<T>();
    }
    return backing ?? memoryStorage<T>();
  }

  return {
    async get() {
      try {
        return await (await resolve()).get();
      } catch {
        return null;
      }
    },
    async set(session) {
      try {
        await (await resolve()).set(session);
      } catch {
        // Persisting is best-effort; the in-memory session remains valid.
      }
    },
    async clear() {
      try {
        await (await resolve()).clear();
      } catch {
        // ignore
      }
    }
  };
}
