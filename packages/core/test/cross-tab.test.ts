import { jest } from "@jest/globals";
import { crossTabChannel, noopCrossTabChannel } from "../src/cross-tab.js";

/**
 * Minimal same-process BroadcastChannel stand-in. The real one does not
 * deliver a message back to the sender; this one does, which is *stricter*
 * than the browser — so the "ignores its own echo" test below proves the
 * `from` guard works rather than relying on the platform for it.
 */
class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  private listeners = new Set<(event: { data: unknown }) => void>();
  private closed = false;

  constructor(public name: string) {
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: unknown) {
    if (this.closed) return;
    for (const peer of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      for (const listener of peer.listeners) listener({ data });
    }
  }

  addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.delete(listener);
  }

  close() {
    this.closed = true;
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  static reset() {
    FakeBroadcastChannel.channels.clear();
  }
}

const globalScope = globalThis as Record<string, unknown>;
const originalBC = globalScope.BroadcastChannel;

describe("crossTabChannel", () => {
  beforeEach(() => {
    FakeBroadcastChannel.reset();
    globalScope.BroadcastChannel = FakeBroadcastChannel;
  });

  afterEach(() => {
    globalScope.BroadcastChannel = originalBC;
  });

  it("delivers a signal to another channel with the same name", () => {
    const a = crossTabChannel("proj-1");
    const b = crossTabChannel("proj-1");
    const seen = jest.fn();
    b.subscribe(seen);

    a.post("session-changed");

    expect(seen).toHaveBeenCalledTimes(1);
    expect((seen.mock.calls[0] as any[])[0]).toMatchObject({ signal: "session-changed" });
  });

  it("ignores its own echo, so a tab never re-processes its own change", () => {
    const a = crossTabChannel("proj-1");
    const seen = jest.fn();
    a.subscribe(seen);

    a.post("signout");

    expect(seen).not.toHaveBeenCalled();
  });

  it("does not cross projects", () => {
    const a = crossTabChannel("proj-1");
    const other = crossTabChannel("proj-2");
    const seen = jest.fn();
    other.subscribe(seen);

    a.post("session-changed");

    expect(seen).not.toHaveBeenCalled();
  });

  it("never carries session data in the message", () => {
    const a = crossTabChannel("proj-1");
    const b = crossTabChannel("proj-1");
    let payload: unknown;
    b.subscribe((message) => (payload = message));

    a.post("session-changed");

    expect(Object.keys(payload as object).sort()).toEqual(["at", "from", "signal"]);
  });

  it("unsubscribing stops delivery", () => {
    const a = crossTabChannel("proj-1");
    const b = crossTabChannel("proj-1");
    const seen = jest.fn();
    const off = b.subscribe(seen);

    off();
    a.post("session-changed");

    expect(seen).not.toHaveBeenCalled();
  });

  it("falls back to a no-op channel when neither BroadcastChannel nor localStorage exists", () => {
    delete globalScope.BroadcastChannel;
    const channel = crossTabChannel("proj-1");
    const seen = jest.fn();
    channel.subscribe(seen);

    expect(() => channel.post("signout")).not.toThrow();
    expect(seen).not.toHaveBeenCalled();
    channel.close();
  });
});

describe("noopCrossTabChannel", () => {
  it("is inert but safe to call", () => {
    const channel = noopCrossTabChannel();
    const seen = jest.fn();
    const off = channel.subscribe(seen);
    channel.post("session-changed");
    off();
    channel.close();
    expect(seen).not.toHaveBeenCalled();
  });
});
