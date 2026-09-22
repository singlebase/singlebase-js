import {
  clientKey,
  getDefaultClient,
  resolveClient,
  setDefaultClient,
  unregisterClient
} from "../src/registry.js";
import type { SinglebaseOptions } from "../src/types.js";

const OPTIONS = (over: Partial<SinglebaseOptions> = {}): SinglebaseOptions => ({
  baseUrl: "https://api.example.com",
  urlAccessKey: "proj-1",
  apiKey: "wk_test",
  ...over
});

function freshRegistry() {
  // The registry deliberately lives on globalThis so duplicated copies of the
  // module agree; clearing it between tests keeps them independent.
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("singlebase.client.registry")];
}

describe("client registry", () => {
  beforeEach(freshRegistry);

  it("returns the same instance for the same connection details", () => {
    const a = resolveClient(OPTIONS(), () => ({ id: "a" }));
    const b = resolveClient(OPTIONS(), () => ({ id: "b" }));
    expect(b).toBe(a);
  });

  it("creates separate instances per project", () => {
    const a = resolveClient(OPTIONS({ urlAccessKey: "proj-1" }), () => ({ id: "a" }));
    const b = resolveClient(OPTIONS({ urlAccessKey: "proj-2" }), () => ({ id: "b" }));
    expect(b).not.toBe(a);
  });

  it("treats a different audience as a different client", () => {
    expect(clientKey(OPTIONS({ audience: "web" }))).not.toEqual(
      clientKey(OPTIONS({ audience: "admin" }))
    );
  });

  it("makes the first client the page default, which is what unwired widgets find", () => {
    const first = resolveClient(OPTIONS(), () => ({ id: "first" }));
    resolveClient(OPTIONS({ urlAccessKey: "proj-2" }), () => ({ id: "second" }));
    expect(getDefaultClient()).toBe(first);
  });

  it("survives a duplicated copy of the module, which is the multi-widget case", async () => {
    const created = resolveClient(OPTIONS(), () => ({ id: "shared" }));

    // A second, independently-evaluated copy of registry.ts — exactly what a
    // page gets when it loads the bundled widget *and* imports the SDK. Module
    // scope is not shared between these two; globalThis is.
    const duplicate = await import(`../src/registry.js?copy=${Date.now()}`);

    expect(duplicate.getDefaultClient()).toBe(created);
    expect(duplicate.resolveClient(OPTIONS(), () => ({ id: "other" }))).toBe(created);
  });

  it("setDefaultClient overrides the fallback", () => {
    resolveClient(OPTIONS(), () => ({ id: "first" }));
    const override = { id: "override" };
    setDefaultClient(override);
    expect(getDefaultClient()).toBe(override);
  });

  it("unregistering the default promotes another instance, or clears it", () => {
    const first = resolveClient(OPTIONS(), () => ({ id: "first" }));
    const second = resolveClient(OPTIONS({ urlAccessKey: "proj-2" }), () => ({ id: "second" }));

    unregisterClient(first);
    expect(getDefaultClient()).toBe(second);

    unregisterClient(second);
    expect(getDefaultClient()).toBeNull();
  });
});
